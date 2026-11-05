-- SPDX-License-Identifier: Apache-2.0
-- Copyright (c) 2026 PeopleOS contributors

-- Chạy SAU key-auth (phase access): biến một API key thành session Hasura của đúng tenant.
--  * Mọi header x-hasura-* do client gửi bị XÓA; tenant/role chỉ lấy từ labels của Consumer (hệ thống đặt).
--  * scope read  -> role tenant_api_read  (chỉ select)
--    scope write -> role tenant_api_write (select + ghi dữ liệu của chính tenant)
--  * Gateway giữ HASURA_ADMIN_SECRET (khai báo trong nginx_config.envs); phải chặn mọi đường vào Hasura khác gateway/BFF.
return function(conf, ctx)
  local core = require("apisix.core")
  local c = ctx.consumer
  local labels = c and c.labels
  local tenant_id = labels and labels.tenant_id
  local scope = labels and labels.scope
  if not tenant_id or not scope then
    return 403, { message = "API key chưa gắn tenant" }
  end
  local secret = os.getenv("HASURA_ADMIN_SECRET")
  if not secret or secret == "" then
    return 500, { message = "Gateway chưa được cấu hình đầy đủ" }
  end

  for name, _ in pairs(core.request.headers(ctx)) do
    if string.sub(string.lower(name), 1, 9) == "x-hasura-" then
      core.request.set_header(ctx, name, nil)
    end
  end

  local role = (scope == "write") and "tenant_api_write" or "tenant_api_read"
  core.request.set_header(ctx, "x-hasura-admin-secret", secret)
  core.request.set_header(ctx, "x-hasura-role", role)
  core.request.set_header(ctx, "x-hasura-tenant-id", tenant_id)
  core.request.set_header(ctx, "x-hasura-user-id", c.username)
  core.request.set_header(ctx, "X-API-Key", nil)          -- không chuyển tiếp khóa tới upstream
end
