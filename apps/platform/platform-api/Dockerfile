# SPDX-License-Identifier: Apache-2.0
# Copyright (c) 2026 PeopleOS contributors

FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY platform_api ./platform_api
RUN useradd -r -u 10001 app && chown -R app /app
USER app
EXPOSE 8090
# API:    uvicorn platform_api.api:app --host 0.0.0.0 --port 8090
# Worker: python -m platform_api.worker
CMD ["uvicorn", "platform_api.api:app", "--host", "0.0.0.0", "--port", "8090"]
