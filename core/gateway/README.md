# API Gateway (Apache APISIX, chế độ standalone)

| Route | Đích | Ghi chú |
|---|---|---|
| `/graphql` | Hasura `/v1/graphql` | JWT bắt buộc |
| `/api/*` | BFF `:8000` | JWT bắt buộc |
| `/api/internal/*` | - | Trả 404 (chỉ n8n gọi nội bộ) |
| `/ai/*` | RAG `:8001` | JWT bắt buộc, rewrite bỏ tiền tố `/ai` |
| `/ws` | BFF WebSocket | Token qua `?token=`, BFF tự xác thực chữ ký |

Xác thực: plugin `openid-connect` (bearer_only, kiểm chữ ký bằng JWKS của Keycloak). Không cần etcd vì dùng `config_provider: yaml`.
