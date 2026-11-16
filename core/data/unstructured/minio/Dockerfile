# SPDX-License-Identifier: Apache-2.0
# Copyright (c) 2026 PeopleOS contributors

# MinIO server + MinIO Client (mc) build từ MÃ NGUỒN CHÍNH THỨC của MinIO (github.com/minio), không sửa đổi.
# Lý do: từ 10/2025 MinIO ngừng phát hành image/binary cộng đồng; dùng image mirror của bên thứ ba thì không kiểm chứng
# được nguồn gốc. Build từ tag phát hành chính thức giúp truy được chính xác mã nguồn của từng tệp chạy.
#
#   docker build -t peopleos/minio:RELEASE.2025-10-15T17-29-55Z core/data/unstructured/minio
#
# Giấy phép: MinIO và mc theo AGPL-3.0 (văn bản kèm trong image tại /licenses). PeopleOS chạy MinIO như một dịch vụ riêng,
# truy cập qua API S3, không liên kết mã - xem THIRD_PARTY_LICENSES.md.

ARG GO_VERSION=1.24

FROM golang:${GO_VERSION}-alpine AS build
RUN apk add --no-cache git
ENV CGO_ENABLED=0 GOTOOLCHAIN=auto
# Tag phát hành chính thức (git tag trên github.com/minio/minio và github.com/minio/mc)
ARG MINIO_TAG=RELEASE.2025-10-15T17-29-55Z
ARG MC_TAG=RELEASE.2025-08-13T08-35-41Z

# "RELEASE.2025-10-15T17-29-55Z" -> "2025-10-15T17:29:55Z" (định dạng gen-ldflags.go của MinIO cần)
RUN git clone --depth 1 --branch "${MINIO_TAG}" https://github.com/minio/minio /src/minio \
 && cd /src/minio \
 && v=$(echo "${MINIO_TAG#RELEASE.}" | sed -E 's/T([0-9]+)-([0-9]+)-([0-9]+)Z$/T\1:\2:\3Z/') \
 && go build -tags kqueue -trimpath -ldflags "$(MINIO_RELEASE=RELEASE go run buildscripts/gen-ldflags.go "$v")" -o /out/minio .

RUN git clone --depth 1 --branch "${MC_TAG}" https://github.com/minio/mc /src/mc \
 && cd /src/mc \
 && v=$(echo "${MC_TAG#RELEASE.}" | sed -E 's/T([0-9]+)-([0-9]+)-([0-9]+)Z$/T\1:\2:\3Z/') \
 && go build -tags kqueue -trimpath -ldflags "$(MC_RELEASE=RELEASE go run buildscripts/gen-ldflags.go "$v")" -o /out/mc . \
 && mkdir -p /out/licenses/minio /out/licenses/mc \
 && cp /src/minio/LICENSE /src/minio/CREDITS /out/licenses/minio/ \
 && cp /src/mc/LICENSE /out/licenses/mc/ \
 && printf 'Ma nguon tuong ung (AGPL-3.0):\n  https://github.com/minio/minio/tree/%s\n  https://github.com/minio/mc/tree/%s\n' "${MINIO_TAG}" "${MC_TAG}" > /out/licenses/SOURCE.txt

FROM alpine:3.20
RUN apk add --no-cache ca-certificates
COPY --from=build /out/minio /out/mc /usr/bin/
COPY --from=build /out/licenses /licenses
ARG MINIO_TAG=RELEASE.2025-10-15T17-29-55Z
LABEL org.opencontainers.image.title="minio (build từ mã nguồn)" \
      org.opencontainers.image.source="https://github.com/minio/minio" \
      org.opencontainers.image.version="${MINIO_TAG}" \
      org.opencontainers.image.licenses="AGPL-3.0-only"
EXPOSE 9000 9001
VOLUME ["/data"]
ENTRYPOINT ["minio"]
CMD ["server", "/data", "--console-address", ":9001"]
