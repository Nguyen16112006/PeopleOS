# RAG Service (AI Assistant)

```
app/
├── main.py      # POST /chat, GET /health, POST /reindex
├── intents.py   # phân loại câu hỏi, trích số tiền / người phụ thuộc / vùng
├── tools.py     # tính Gross↔Net (peopleos_shared.payroll) + tra cứu Hasura bằng JWT người hỏi
├── rag.py       # tách văn bản (LangChain) → embedding (Ollama) → Qdrant → sinh câu trả lời
└── config.py
```

- Kho tri thức: `ai/knowledge/*.md` (tiêu đề `##` được dùng làm ranh giới đoạn).
- Chế độ dự phòng: nếu Ollama/Qdrant chưa sẵn sàng, dùng tìm kiếm từ khóa TF-IDF và trả đoạn trích có nguồn.
- Đổi mô hình: `OLLAMA_CHAT_MODEL`, `OLLAMA_EMBED_MODEL` trong `.env` (đổi mô hình embedding → gọi `POST /ai/reindex`).
- Test: `pip install -r requirements.txt pytest && python -m pytest tests` (21 test, không cần Ollama/Qdrant).
- Cổng 8001 không công khai ra ngoài; truy cập qua gateway `/ai/*` (JWT bắt buộc).
