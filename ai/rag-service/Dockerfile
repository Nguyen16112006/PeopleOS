# Build context = thư mục gốc của repo (xem docker-compose.yml)
FROM python:3.12-slim
WORKDIR /app
COPY ai/rag-service/requirements.txt .
RUN pip install --no-cache-dir --default-timeout=300 --retries 10 -r requirements.txt
COPY core/shared/python /opt/shared
COPY ai/rag-service/app ./app
ENV PYTHONPATH=/opt/shared:/app PYTHONUNBUFFERED=1
EXPOSE 8001
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8001"]
