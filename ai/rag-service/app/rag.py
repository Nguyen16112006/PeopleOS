# SPDX-License-Identifier: Apache-2.0
"""RAG trên kho tri thức Luật Lao động / BHXH / Thuế TNCN / chính sách nội bộ.

Quy trình: tách văn bản (LangChain text splitter) -> embedding (Ollama bge-m3) -> lưu Qdrant
-> truy xuất top-k -> sinh câu trả lời bằng Ollama. Nếu Ollama/Qdrant chưa sẵn sàng, hệ thống
tự chuyển sang tìm kiếm từ khóa (TF-IDF) và trả về các đoạn trích, nên demo không bao giờ "chết".
"""
import asyncio
import logging
import math
import re
from collections import Counter
from dataclasses import dataclass
from pathlib import Path

import httpx
from langchain_text_splitters import RecursiveCharacterTextSplitter

from .config import settings
from .intents import strip_accents

log = logging.getLogger("peopleos.rag")

SYSTEM_PROMPT = (
    "Bạn là Trợ lý PeopleOS, chuyên về Luật Lao động, BHXH, BHYT, thuế TNCN và chính sách nhân sự của công ty tại Việt Nam. "
    "Chỉ trả lời dựa trên phần NGỮ CẢNH được cung cấp. Nếu ngữ cảnh không đủ, hãy nói rõ bạn chưa có thông tin và "
    "khuyên người dùng hỏi bộ phận Nhân sự hoặc cơ quan có thẩm quyền. Trả lời bằng tiếng Việt, ngắn gọn, "
    "nêu căn cứ (điều luật, mức tỷ lệ) khi có. Không bịa số liệu."
)


@dataclass
class Chunk:
    id: int
    text: str
    source: str
    heading: str


def load_chunks(directory: str) -> list[Chunk]:
    splitter = RecursiveCharacterTextSplitter(chunk_size=900, chunk_overlap=120,
                                              separators=["\n\n", "\n", ". ", " "])
    chunks: list[Chunk] = []
    for path in sorted(Path(directory).glob("*.md")):
        raw = path.read_text(encoding="utf-8")
        title = next((ln[2:].strip() for ln in raw.splitlines() if ln.startswith("# ")), path.stem)
        for section in re.split(r"\n(?=## )", raw):
            lines = section.strip().splitlines()
            if not lines:
                continue
            heading = lines[0].lstrip("# ").strip()
            body = "\n".join(lines[1:]).strip() if lines[0].startswith("#") else section
            if not body:
                continue
            for piece in splitter.split_text(body):
                chunks.append(Chunk(len(chunks), f"[{title} › {heading}]\n{piece}", path.name, heading))
    return chunks


# ------------------------- Tìm kiếm từ khóa (dự phòng) -------------------------
def _tok(s: str) -> list[str]:
    return [w for w in re.findall(r"[a-z0-9]+", strip_accents(s)) if len(w) > 1]


class LexicalIndex:
    def __init__(self, chunks: list[Chunk]) -> None:
        self.chunks = chunks
        self.docs = [Counter(_tok(c.text)) for c in chunks]
        df = Counter(w for d in self.docs for w in d)
        n = max(len(chunks), 1)
        self.idf = {w: math.log(1 + n / c) for w, c in df.items()}

    def search(self, query: str, k: int) -> list[Chunk]:
        q = _tok(query)
        scored = []
        for chunk, d in zip(self.chunks, self.docs):
            length = sum(d.values()) or 1
            score = sum(self.idf.get(w, 0) * d[w] / length ** 0.5 for w in q if w in d)
            # thưởng khi cụm 2 từ liền nhau xuất hiện
            text = " ".join(_tok(chunk.text))
            score += sum(1.5 for a, b in zip(q, q[1:]) if f"{a} {b}" in text)
            if score > 0:
                scored.append((score, chunk))
        scored.sort(key=lambda x: -x[0])
        return [c for _, c in scored[:k]]


# ------------------------- Ollama + Qdrant -------------------------
async def embed(texts: list[str]) -> list[list[float]]:
    async with httpx.AsyncClient(timeout=120) as c:
        r = await c.post(f"{settings.ollama_url}/api/embed", json={"model": settings.embed_model, "input": texts})
        r.raise_for_status()
        return r.json()["embeddings"]


async def chat(question: str, contexts: list[Chunk], history: list[dict]) -> str:
    ctx = "\n\n".join(c.text for c in contexts)
    messages = [{"role": "system", "content": SYSTEM_PROMPT}]
    messages += [{"role": h["role"], "content": h["content"]} for h in history[-6:] if h.get("role") in ("user", "assistant")]
    messages.append({"role": "user", "content": f"NGỮ CẢNH:\n{ctx}\n\nCÂU HỎI: {question}"})
    async with httpx.AsyncClient(timeout=180) as c:
        r = await c.post(f"{settings.ollama_url}/api/chat", json={
            "model": settings.chat_model, "messages": messages, "stream": False, "options": {"temperature": 0.2}})
        r.raise_for_status()
        return r.json()["message"]["content"].strip()


class KnowledgeBase:
    def __init__(self) -> None:
        self.chunks: list[Chunk] = []
        self.lexical = LexicalIndex([])
        self.vector_ready = False
        self._qdrant = None

    def load(self) -> None:
        self.chunks = load_chunks(settings.knowledge_dir)
        self.lexical = LexicalIndex(self.chunks)
        log.info("Đã nạp %d đoạn tri thức từ %s", len(self.chunks), settings.knowledge_dir)

    def _client(self):
        if self._qdrant is None:
            from qdrant_client import QdrantClient
            self._qdrant = QdrantClient(url=settings.qdrant_url, timeout=20)
        return self._qdrant

    async def ingest(self, force: bool = False) -> None:
        """Embedding toàn bộ chunk và ghi vào Qdrant (bỏ qua nếu đã đủ dữ liệu)."""
        from qdrant_client.models import Distance, PointStruct, VectorParams
        qc = self._client()
        if not force and await asyncio.to_thread(qc.collection_exists, settings.collection):
            info = await asyncio.to_thread(qc.get_collection, settings.collection)
            if (info.points_count or 0) >= len(self.chunks) > 0:
                self.vector_ready = True
                return
        vectors: list[list[float]] = []
        for i in range(0, len(self.chunks), 16):
            vectors += await embed([c.text for c in self.chunks[i:i + 16]])
        if await asyncio.to_thread(qc.collection_exists, settings.collection):
            await asyncio.to_thread(qc.delete_collection, settings.collection)
        await asyncio.to_thread(qc.create_collection, settings.collection,
                                vectors_config=VectorParams(size=len(vectors[0]), distance=Distance.COSINE))
        points = [PointStruct(id=c.id, vector=v, payload={"text": c.text, "source": c.source, "heading": c.heading})
                  for c, v in zip(self.chunks, vectors)]
        await asyncio.to_thread(qc.upsert, settings.collection, points=points)
        self.vector_ready = True
        log.info("Đã ingest %d vector vào Qdrant", len(points))

    async def bootstrap(self) -> None:
        """Chạy nền: thử ingest đến khi Ollama + Qdrant sẵn sàng (mô hình lần đầu tải khá lâu)."""
        while not self.vector_ready:
            try:
                await self.ingest()
            except Exception as exc:
                log.info("Chưa ingest được (%s) - đang dùng tìm kiếm từ khóa, thử lại sau 15s", exc)
                await asyncio.sleep(15)

    async def search(self, question: str, k: int) -> tuple[list[Chunk], str]:
        if self.vector_ready:
            try:
                vec = (await embed([question]))[0]
                res = await asyncio.to_thread(self._client().query_points, settings.collection, query=vec, limit=k)
                found = [Chunk(p.id, p.payload["text"], p.payload["source"], p.payload["heading"]) for p in res.points]
                if found:
                    return found, "vector"
            except Exception as exc:
                log.warning("Tìm vector lỗi (%s) - dùng tìm kiếm từ khóa", exc)
        return self.lexical.search(question, k), "lexical"

    async def answer(self, question: str, history: list[dict]) -> dict:
        contexts, retrieval = await self.search(question, settings.top_k)
        sources = [{"source": c.source, "heading": c.heading} for c in contexts]
        if not contexts:
            return {"answer": "Mình chưa tìm thấy thông tin phù hợp trong kho tri thức. Bạn thử diễn đạt khác hoặc hỏi bộ phận Nhân sự nhé.",
                    "sources": [], "mode": retrieval}
        try:
            return {"answer": await chat(question, contexts, history), "sources": sources, "mode": f"llm+{retrieval}"}
        except Exception as exc:
            log.warning("Ollama chưa sẵn sàng (%s) - trả về đoạn trích", exc)
            excerpt = "\n\n".join(c.text for c in contexts[:2])
            return {"answer": "Mô hình ngôn ngữ chưa sẵn sàng (đang tải). Đây là các đoạn tri thức liên quan nhất:\n\n" + excerpt,
                    "sources": sources, "mode": f"extractive+{retrieval}"}


kb = KnowledgeBase()
