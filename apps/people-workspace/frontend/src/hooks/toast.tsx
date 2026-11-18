// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 PeopleOS contributors

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { CheckCircle2, Info, XCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

type Kind = 'info' | 'success' | 'error'
interface Toast { id: number; title: string; message?: string; kind: Kind; undo?: () => void; ms?: number }
type PushArg = Omit<Toast, 'id' | 'kind' | 'undo'> & { kind?: Kind }

/** Hành động có thể hoàn tác: chỉ gửi lên server sau `delay` ms nếu người dùng không bấm "Hoàn tác". */
interface Deferred {
  title: string
  commit: () => Promise<unknown>
  onDone?: () => void
  onUndo?: () => void
  delay?: number
}

interface ToastApi {
  push: (t: PushArg) => void
  deferred: (d: Deferred) => void
}
const Ctx = createContext<ToastApi>({ push: () => {}, deferred: () => {} })
export const useToast = () => useContext(Ctx)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([])
  const timers = useRef(new Map<number, number>())
  // Các lệnh đang chờ hết thời gian hoàn tác; được gửi ngay nếu trang sắp đóng
  const pending = useRef(new Map<number, () => void>())

  useEffect(() => {
    const flush = () => { Array.from(pending.current.values()).forEach((run) => run()) }
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!pending.current.size) return
      flush()
      // Giữ trang lại một nhịp để yêu cầu kịp gửi đi; trình duyệt sẽ hỏi người dùng có rời trang không
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    window.addEventListener('pagehide', flush)
    return () => { window.removeEventListener('beforeunload', onBeforeUnload); window.removeEventListener('pagehide', flush) }
  }, [])

  const remove = useCallback((id: number) => {
    setItems((x) => x.filter((i) => i.id !== id))
    const t = timers.current.get(id)
    if (t) { window.clearTimeout(t); timers.current.delete(id) }
  }, [])

  const push = useCallback((t: PushArg) => {
    const id = Date.now() + Math.random()
    setItems((x) => [...x, { id, kind: 'info', ...t }])
    timers.current.set(id, window.setTimeout(() => remove(id), t.kind === 'error' ? 9000 : 6000))
  }, [remove])

  const deferred = useCallback((d: Deferred) => {
    const id = Date.now() + Math.random()
    const delay = d.delay ?? 5000
    const run = async () => {
      // Chạy đúng một lần: khi hết giờ, hoặc ngay lúc trang sắp đóng
      if (!pending.current.delete(id)) return
      remove(id)
      try { await d.commit(); d.onDone?.() }
      catch (e) {
        push({ title: 'Không thực hiện được', message: e instanceof Error ? e.message : String(e), kind: 'error' })
        d.onUndo?.()
      }
    }
    const undo = () => { pending.current.delete(id); remove(id); d.onUndo?.() }
    pending.current.set(id, () => { void run() })
    setItems((x) => [...x, { id, kind: 'success', title: d.title, message: `Gửi đi sau ${Math.round(delay / 1000)} giây.`, undo, ms: delay }])
    timers.current.set(id, window.setTimeout(() => { void run() }, delay))
  }, [push, remove])

  return (
    <Ctx.Provider value={{ push, deferred }}>
      {children}
      <div className="po-toasts" role="status" aria-live="polite" aria-relevant="additions">
        {items.filter((t) => t.kind !== 'error').map((t) => (
          <div key={t.id} className={cn('po-toast', t.kind)}>
            {t.kind === 'error' ? <XCircle aria-hidden="true" /> : t.kind === 'success' ? <CheckCircle2 aria-hidden="true" /> : <Info aria-hidden="true" />}
            <div className="po-toast-copy">
              <p>{t.title}</p>
              {t.message && <span>{t.message}</span>}
            </div>
            {t.undo && <button type="button" className="po-toast-undo" onClick={t.undo}>Hoàn tác</button>}
            {t.ms && <i className="po-toast-timer" style={{ animationDuration: `${t.ms}ms` }} aria-hidden="true" />}
          </div>
        ))}
        <div role="alert" className="contents">
          {items.filter((t) => t.kind === 'error').map((t) => (
            <div key={t.id} className="po-toast error">
              <XCircle aria-hidden="true" />
              <div className="po-toast-copy"><p>{t.title}</p>{t.message && <span>{t.message}</span>}</div>
            </div>
          ))}
        </div>
      </div>
    </Ctx.Provider>
  )
}
