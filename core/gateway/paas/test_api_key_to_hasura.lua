-- SPDX-License-Identifier: Apache-2.0
-- Copyright (c) 2026 PeopleOS contributors

-- Chạy từ GỐC repo: lua5.4 core/gateway/paas/test_api_key_to_hasura.lua  (stub apisix.core; kiểm tra logic gắn tenant/role)
local function run(label, ctx_consumer, client_headers, env_secret, expect)
  local sent, removed = {}, {}
  local headers = {}
  for k, v in pairs(client_headers) do headers[k] = v end
  package.loaded["apisix.core"] = {
    request = {
      headers = function(ctx) return headers end,
      set_header = function(ctx, name, value)
        if value == nil then headers[name] = nil; removed[name] = true else headers[name] = value; sent[name] = value end
      end },
  }
  local real_getenv = os.getenv
  os.getenv = function(k) if k == "HASURA_ADMIN_SECRET" then return env_secret end return real_getenv(k) end
  local fn = dofile("core/gateway/paas/api-key-to-hasura.lua")
  local code, body = fn({}, { consumer = ctx_consumer })
  os.getenv = real_getenv
  local ok = true
  if expect.code ~= code then ok = false end
  if expect.check and not expect.check(headers, code) then ok = false end
  print((ok and "PASS " or "FAIL ") .. label)
  if not ok then os.exit(1) end
end
local good = { username = "prj_ab12cd_deadbeef", labels = { tenant_id = "T-A", short_id = "ab12cd", scope = "read" } }
run("scope read -> tenant_api_read, tenant lấy từ consumer", good,
    { ["X-Hasura-Role"] = "admin", ["x-hasura-tenant-id"] = "T-B", ["X-HASURA-USER-ID"] = "evil", ["x-hasura-admin-secret"] = "guess", ["X-API-Key"] = "pos_k", ["Content-Type"] = "application/json" },
    "S3CRET", { code = nil, check = function(h)
      return h["x-hasura-role"] == "tenant_api_read" and h["x-hasura-tenant-id"] == "T-A" and h["x-hasura-admin-secret"] == "S3CRET"
        and h["x-hasura-user-id"] == "prj_ab12cd_deadbeef" and h["X-Hasura-Role"] == nil and h["X-HASURA-USER-ID"] == nil
        and h["X-API-Key"] == nil and h["Content-Type"] == "application/json" end })
local w = { username = "u", labels = { tenant_id = "T-A", scope = "write" } }
run("scope write -> tenant_api_write", w, {}, "S", { check = function(h) return h["x-hasura-role"] == "tenant_api_write" end })
run("scope lạ không được nâng quyền (mặc định read)", { username = "u", labels = { tenant_id = "T", scope = "admin" } }, {}, "S",
    { check = function(h) return h["x-hasura-role"] == "tenant_api_read" end })
run("thiếu tenant -> 403", { username = "u", labels = { scope = "read" } }, {}, "S", { code = 403 })
run("không có consumer -> 403", nil, {}, "S", { code = 403 })
run("thiếu secret gateway -> 500", good, {}, "", { code = 500 })
