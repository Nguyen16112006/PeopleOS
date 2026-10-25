// SPDX-License-Identifier: Apache-2.0
import Keycloak from 'keycloak-js'

export const keycloak = new Keycloak({
  url: import.meta.env.VITE_KEYCLOAK_URL ?? 'http://localhost:8080',
  realm: import.meta.env.VITE_KEYCLOAK_REALM ?? 'peopleos',
  clientId: import.meta.env.VITE_KEYCLOAK_CLIENT_ID ?? 'people-workspace',
})

// Chỉ khởi tạo một lần (React StrictMode gọi effect hai lần ở môi trường dev)
let initPromise: Promise<boolean> | null = null
export function initKeycloak() {
  if (!initPromise) {
    initPromise = keycloak.init({ onLoad: 'login-required', pkceMethod: 'S256', checkLoginIframe: false })
  }
  return initPromise
}

export async function getToken(): Promise<string> {
  try {
    await keycloak.updateToken(30)
  } catch {
    await keycloak.login()
  }
  return keycloak.token ?? ''
}

// Lưu ý: vai trò quản trị kỹ thuật tên 'sysadmin' (Hasura coi 'admin' là siêu quyền nên không dùng tên đó)
const ROLE_ORDER = ['sysadmin', 'director', 'accountant', 'hr', 'manager', 'employee']
export function currentRoles(): string[] {
  return keycloak.tokenParsed?.realm_access?.roles ?? []
}
export function primaryRole(): string {
  const roles = currentRoles()
  return ROLE_ORDER.find((r) => roles.includes(r)) ?? 'employee'
}
