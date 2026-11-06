# Kubernetes (Phase 3)

Bố cục: `platform-system` (control plane), `gateway` (APISIX), `cell-N` (Hasura + PostgreSQL CloudNativePG + PgBouncer).

Điều kiện: operator **CloudNativePG** và **KEDA**, etcd (vd. helm `bitnami/etcd`) tại `etcd.gateway.svc:2379`, Keycloak ở namespace `identity`.

```bash
# Secret: lập từ secrets.example.yaml bằng External Secrets/Sealed Secrets (KHÔNG commit giá trị thật)
kubectl kustomize --load-restrictor=LoadRestrictionsNone . | kubectl apply -f -
# Nạp route/consumer-group vào APISIX (một lần, từ pod/job có tới được apisix-admin):
python scripts/apisix-paas-bootstrap.py
```
`--load-restrictor` cần vì ConfigMap của APISIX đọc `core/gateway/config.paas.yaml` nằm ngoài thư mục này.

Trạng thái: đã kiểm schema bằng `kubeconform --strict` (25 resource) và `kustomize build`; **chưa áp lên cluster thật**.
Đã có Job `db-migrate` (role owner, psql có sổ cái) và `hasura-metadata-apply` (hasura-cli). Còn thiếu: Ingress/TLS, etcd, observability, quota/LimitRange theo namespace. Thứ tự: build 2 image trong `core/data/structured/` (Dockerfile.migrate, Dockerfile.metadata) -> db-migrate -> Hasura -> metadata-apply.
