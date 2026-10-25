#!/bin/sh
# SPDX-License-Identifier: Apache-2.0
# =====================================================================
# GitOps agent: Git là nguồn sự thật duy nhất của cấu hình hệ thống.
# Mỗi GITOPS_INTERVAL giây:
#   1. git fetch; nếu nhánh remote có commit mới -> fast-forward (không ghi đè thay đổi cục bộ).
#   2. Đối chiếu (reconcile): docker compose up -d  -> đưa hệ thống đang chạy về đúng trạng thái khai báo
#      (khởi động lại container bị dừng, áp dụng cấu hình đã thay đổi, build lại khi có commit mới).
# Chạy trong container docker:cli, đường dẫn kho được mount TRÙNG đường dẫn trên máy chủ để các bind-mount hoạt động.
# =====================================================================
set -u
REPO="${HOST_REPO_PATH:-/opt/peopleos}"
BRANCH="${GITOPS_BRANCH:-main}"
INTERVAL="${GITOPS_INTERVAL:-60}"
COMPOSE="docker compose --project-directory $REPO/infrastructure -f $REPO/infrastructure/docker-compose.yml --profile gitops"
log() { echo "[gitops] $(date '+%F %T') $*"; }

apk add --no-cache git >/dev/null 2>&1 || log "cảnh báo: không cài được git"
git config --global --add safe.directory "$REPO"
cd "$REPO" || { log "không thấy kho Git tại $REPO"; exit 1; }
log "bắt đầu theo dõi nhánh '$BRANCH' tại $REPO mỗi ${INTERVAL}s"

while true; do
  changed=0
  if git fetch --quiet origin "$BRANCH" 2>/dev/null; then
    local_rev=$(git rev-parse HEAD)
    remote_rev=$(git rev-parse "origin/$BRANCH")
    if [ "$local_rev" != "$remote_rev" ]; then
      if git merge --ff-only "origin/$BRANCH" >/dev/null 2>&1; then
        log "đã cập nhật ${local_rev%"${local_rev#???????}"} -> ${remote_rev%"${remote_rev#???????}"}"
        changed=1
      else
        log "LỆCH: kho cục bộ khác nhánh remote và không thể fast-forward - cần xử lý thủ công"
      fi
    fi
  else
    log "không fetch được remote (mạng/quyền?), vẫn đối chiếu theo trạng thái hiện tại"
  fi

  if [ "$changed" = "1" ]; then
    $COMPOSE up -d --build >/dev/null 2>&1 && log "đã áp dụng thay đổi (build lại)" || log "LỖI khi áp dụng thay đổi"
  else
    $COMPOSE up -d >/dev/null 2>&1 || log "LỖI khi đối chiếu trạng thái"
  fi
  sleep "$INTERVAL"
done
