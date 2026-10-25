# SPDX-License-Identifier: Apache-2.0
import os


class Settings:
    def __init__(self) -> None:
        e = os.environ.get
        self.ollama_url = e("OLLAMA_URL", "http://ollama:11434")
        self.chat_model = e("OLLAMA_CHAT_MODEL", "qwen2.5:3b")
        self.embed_model = e("OLLAMA_EMBED_MODEL", "bge-m3")
        self.qdrant_url = e("QDRANT_URL", "http://qdrant:6333")
        self.collection = e("QDRANT_COLLECTION", "peopleos_knowledge")
        self.hasura_url = e("HASURA_URL", "http://hasura:8080/v1/graphql")
        self.knowledge_dir = e("KNOWLEDGE_DIR", "/knowledge")
        self.top_k = int(e("RAG_TOP_K", "4"))


settings = Settings()
