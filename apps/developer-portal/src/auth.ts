// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 PeopleOS contributors

import Keycloak from 'keycloak-js'

const keycloak = new Keycloak({
  url: import.meta.env.VITE_KEYCLOAK_URL ?? 'http://localhost:8080',
  realm: 'peopleos-platform',
  clientId: 'developer-portal',
})

let started: Promise<boolean> | null = null

/** Đăng nhập (Authorization Code + PKCE). Gọi nhiều lần vẫn chỉ khởi tạo một lần. */
export function login(): Promise<boolean> {
  started ??= keycloak.init({ onLoad: 'login-required', pkceMethod: 'S256', checkLoginIframe: false })
  return started
}

export async function freshToken(): Promise<string> {
  await keycloak.updateToken(30)
  if (!keycloak.token) throw new Error('Chưa đăng nhập')
  return keycloak.token
}

export const userEmail = (): string => (keycloak.tokenParsed?.email as string | undefined) ?? 'developer'
export const logout = (): Promise<void> => keycloak.logout({ redirectUri: window.location.origin })
