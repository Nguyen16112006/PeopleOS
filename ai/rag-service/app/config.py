# SPDX-License-Identifier: Apache-2.0
# Copyright (c) 2026 PeopleOS contributors

import os
from pathlib import Path

# Khi chạy ngoài Docker (uvicorn trực tiếp), mặc định đọc tri thức ngay trong kho mã: ai/knowledge
_REPO_KNOWLEDGE = Path(__file__).resolve().parents[2] / "knowledge"


def _default_knowledge_dir() -> str:
    return "/knowledge" if Path("/knowledge").is_dir() else str(_REPO_KNOWLEDGE)


class Settings:
    def __init__(self) -> None:
        e = os.environ.get
        self.ollama_url = e("OLLAMA_URL", "http://ollama:11434")
        self.chat_model = e("OLLAMA_CHAT_MODEL", "qwen2.5:1.5b")
        self.embed_model = e("OLLAMA_EMBED_MODEL", "bge-m3")
        self.qdrant_url = e("QDRANT_URL", "http://qdrant:6333")
        self.collection = e("QDRANT_COLLECTION", "peopleos_knowledge")
        self.hasura_url = e("HASURA_URL", "http://hasura:8080/v1/graphql")
        self.knowledge_dir = e("KNOWLEDGE_DIR") or _default_knowledge_dir()
        self.top_k = int(e("RAG_TOP_K", "4"))


settings = Settings()
