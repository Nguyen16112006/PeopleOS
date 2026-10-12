"""AI Assistant - dịch vụ RAG của PeopleOS (FastAPI, cổng 8001, truy cập qua APISIX: /ai/*)."""
import asyncio
import logging
from contextlib import asynccontextmanager
from typing import Optional

import httpx
from fastapi import FastAPI, Header
from pydantic import BaseModel, Field

from . import tools
from .config import settings
from .intents import classify
from .rag import kb

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")


@asynccontextmanager
async def lifespan(_: FastAPI):
    kb.load()
    task = asyncio.create_task(kb.bootstrap())
    yield
    task.cancel()


app = FastAPI(title="PeopleOS RAG Service", version="1.0.0", lifespan=lifespan)


class ChatIn(BaseModel):
    message: str = Field(min_length=1, max_length=2000)
    history: list[dict] = []


@app.get("/health")
async def health():
    async def up(url: str) -> bool:
        try:
            async with httpx.AsyncClient(timeout=3) as c:
                return (await c.get(url)).status_code < 500
        except Exception:
            return False
    return {"status": "ok", "chunks": len(kb.chunks), "vector_ready": kb.vector_ready,
            "ollama": await up(f"{settings.ollama_url}/api/tags"), "qdrant": await up(f"{settings.qdrant_url}/healthz")}


@app.post("/chat")
async def chat(body: ChatIn, authorization: Optional[str] = Header(default=None)):
    token = (authorization or "").removeprefix("Bearer ").strip()
    intent = classify(body.message)
    try:
        if intent == "net_calc":
            return {"intent": intent, "answer": tools.net_calc_answer(body.message), "sources": [], "mode": "calculator"}
        if intent in ("leave_status", "leave_balance", "payslip"):
            if not token:
                return {"intent": intent, "answer": "Bạn cần đăng nhập để mình tra cứu dữ liệu cá nhân.", "sources": [], "mode": "tool"}
            fn = {"leave_status": tools.leave_status_answer, "leave_balance": tools.leave_balance_answer,
                  "payslip": tools.payslip_answer}[intent]
            return {"intent": intent, "answer": await fn(token), "sources": [{"source": "Dữ liệu nội bộ (Hasura)", "heading": "Theo quyền của bạn"}],
                    "mode": "tool"}
    except Exception as exc:  # lỗi tra cứu nội bộ -> báo rõ, không trả lời bịa
        logging.getLogger("peopleos.chat").warning("Tool lỗi: %s", exc)
        return {"intent": intent, "answer": "Mình chưa tra cứu được dữ liệu lúc này, bạn thử lại sau ít phút nhé.", "sources": [], "mode": "error"}
    res = await kb.answer(body.message, body.history)
    return {"intent": "rag", **res}


@app.post("/reindex")
async def reindex():
    """Nạp lại kho tri thức (sau khi sửa file trong ai/knowledge)."""
    kb.load()
    kb.vector_ready = False
    try:
        await kb.ingest(force=True)
        return {"status": "ok", "chunks": len(kb.chunks), "vector_ready": True}
    except Exception as exc:
        asyncio.create_task(kb.bootstrap())
        return {"status": "degraded", "chunks": len(kb.chunks), "vector_ready": False, "detail": str(exc)}
