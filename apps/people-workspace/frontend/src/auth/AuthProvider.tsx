import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { currentRoles, initKeycloak, keycloak, primaryRole } from '@/lib/keycloak'

export interface AuthUser { sub: string; name: string; username: string; email: string; roles: string[]; role: string }
interface AuthCtx { user: AuthUser; logout: () => void; hasRole: (...r: string[]) => boolean }
const Ctx = createContext<AuthCtx | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    initKeycloak()
      .then((ok) => {
        if (!ok) return
        const t = keycloak.tokenParsed as Record<string, any>
        setUser({ sub: t.sub, name: t.name ?? t.preferred_username, username: t.preferred_username, email: t.email ?? '',
          roles: currentRoles(), role: primaryRole() })
      })
      .catch((e) => setError(String(e?.message ?? e)))
  }, [])

  if (error) return <div className="p-8 text-red-600">Không kết nối được Keycloak ({error}). Kiểm tra dịch vụ keycloak đã chạy chưa.</div>
  if (!user) return <div className="flex h-screen items-center justify-center text-muted-foreground">Đang đăng nhập SSO…</div>

  return (
    <Ctx.Provider value={{ user, logout: () => keycloak.logout({ redirectUri: window.location.origin }),
      hasRole: (...r) => r.some((x) => user.roles.includes(x)) }}>
      {children}
    </Ctx.Provider>
  )
}

export function useAuth() {
  const c = useContext(Ctx)
  if (!c) throw new Error('useAuth phải nằm trong AuthProvider')
  return c
}
