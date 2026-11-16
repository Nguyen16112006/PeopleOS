// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 PeopleOS contributors

/**
 * Tùy chỉnh giao diện của từng người dùng.
 * Lưu trong localStorage theo `sub` của tài khoản, nên chỉ áp dụng trên trình duyệt đang dùng.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useAuth } from '@/auth/AuthProvider'

export type Salutation = 'ten' | 'anh' | 'chi' | 'full'
export type Accent = 'muc' | 'cham' | 'than' | 'caphe'
export type TextSize = 'md' | 'lg' | 'xl'
export type Density = 'comfy' | 'compact'
export type Theme = 'light' | 'dark' | 'system'

export interface Prefs {
  salutation: Salutation
  accent: Accent
  size: TextSize
  density: Density
  theme: Theme
  pins: string[]
}

/** Gợi ý mục ghim theo vai trò chính. */
export const DEFAULT_PINS: Record<string, string[]> = {
  employee: ['/payslips', '/timesheet', '/leave'],
  manager: ['/approvals', '/timesheet', '/kpi'],
  hr: ['/approvals', '/payroll', '/onboarding'],
  accountant: ['/payroll', '/advances', '/tax-year'],
  director: ['/approvals', '/payroll', '/executive'],
  sysadmin: ['/audit', '/temp-access', '/lineage'],
}

export const ACCENTS: { key: Accent; label: string; swatch: string }[] = [
  { key: 'muc', label: 'Mực', swatch: '#2f5d9a' },
  { key: 'cham', label: 'Chàm', swatch: '#4b4fa8' },
  { key: 'than', label: 'Than', swatch: '#3a4048' },
  { key: 'caphe', label: 'Cà phê', swatch: '#7a4b2a' },
]

const defaults = (role: string): Prefs => ({
  salutation: 'ten', accent: 'muc', size: 'md', density: 'comfy', theme: 'light',
  pins: DEFAULT_PINS[role] ?? DEFAULT_PINS.employee,
})

const read = <T,>(key: string, fallback: T): T => {
  try {
    const raw = localStorage.getItem(key)
    return raw ? { ...fallback, ...JSON.parse(raw) } : fallback
  } catch { return fallback }
}
const write = (key: string, value: unknown) => {
  try { localStorage.setItem(key, JSON.stringify(value)) } catch { /* trình duyệt chặn lưu trữ */ }
}

/** Tên gọi trong lời chào: tên là chữ cuối của họ tên tiếng Việt. */
export function callName(fullName: string, s: Salutation): string {
  const given = fullName.trim().split(/\s+/).pop() ?? fullName
  if (s === 'anh') return `anh ${given}`
  if (s === 'chi') return `chị ${given}`
  if (s === 'full') return fullName
  return given
}

type Visits = Record<string, string[]> // đường dẫn -> các ngày mở (yyyy-mm-dd), giữ 30 ngày

interface PrefsCtx {
  prefs: Prefs
  setPrefs: (patch: Partial<Prefs>) => void
  reset: () => void
  isDefaultPins: boolean
  togglePin: (path: string) => void
  recordVisit: (path: string) => void
  topVisits: (n: number) => { path: string; count: number }[]
}
const Ctx = createContext<PrefsCtx | null>(null)

function applyToDocument(p: Prefs) {
  const root = document.documentElement
  const dark = p.theme === 'dark' || (p.theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
  root.classList.toggle('dark', dark)
  root.dataset.accent = p.accent
  root.dataset.size = p.size
  root.dataset.density = p.density
  try { localStorage.setItem('peopleos-theme', dark ? 'dark' : 'light') } catch { /* như trên */ }
}

export function PrefsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const prefKey = `peopleos-prefs:${user.sub}`
  const visitKey = `peopleos-visits:${user.sub}`
  const [prefs, setState] = useState<Prefs>(() => read(prefKey, defaults(user.role)))
  const [visits, setVisits] = useState<Visits>(() => read<Visits>(visitKey, {}))

  useEffect(() => {
    applyToDocument(prefs)
    write(prefKey, prefs)
    if (prefs.theme !== 'system') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => applyToDocument(prefs)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [prefs, prefKey])

  const setPrefs = useCallback((patch: Partial<Prefs>) => setState((p) => ({ ...p, ...patch })), [])

  const recordVisit = useCallback((path: string) => {
    if (path === '/' || path === '/settings') return
    const today = new Date().toISOString().slice(0, 10)
    const cutoff = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)
    setVisits((v) => {
      const next: Visits = {}
      const seen = v[path] ?? []
      if (seen[seen.length - 1] === today) return v
      for (const [k, days] of Object.entries({ ...v, [path]: [...seen, today] })) {
        const kept = days.filter((d) => d >= cutoff)
        if (kept.length) next[k] = kept
      }
      write(visitKey, next)
      return next
    })
  }, [visitKey])

  const value = useMemo<PrefsCtx>(() => {
    const def = DEFAULT_PINS[user.role] ?? DEFAULT_PINS.employee
    return {
      prefs,
      setPrefs,
      reset: () => setState(defaults(user.role)),
      isDefaultPins: prefs.pins.join() === def.join(),
      togglePin: (path) => setState((p) => ({ ...p, pins: p.pins.includes(path) ? p.pins.filter((x) => x !== path) : [...p.pins, path] })),
      recordVisit,
      topVisits: (n) => Object.entries(visits)
        .map(([path, days]) => ({ path, count: days.length }))
        .sort((a, b) => b.count - a.count)
        .slice(0, n),
    }
  }, [prefs, setPrefs, recordVisit, visits, user.role])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function usePrefs() {
  const c = useContext(Ctx)
  if (!c) throw new Error('usePrefs phải nằm trong PrefsProvider')
  return c
}
