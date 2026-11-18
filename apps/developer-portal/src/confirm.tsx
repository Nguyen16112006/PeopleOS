// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 PeopleOS contributors

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'

/**
 * Hộp xác nhận cho thao tác xoá/thu hồi, thay window.confirm.
 * `typeToConfirm`: phải gõ đúng chuỗi này (ví dụ tên dự án) mới bấm được, dùng cho việc không thể hoàn tác.
 */
export interface ConfirmOptions { title: string; body?: ReactNode; confirmLabel: string; typeToConfirm?: string }
const Ctx = createContext<(o: ConfirmOptions) => Promise<boolean>>(async () => false)
export const useConfirm = () => useContext(Ctx)

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{ opts: ConfirmOptions; resolve: (v: boolean) => void } | null>(null)
  const confirm = useCallback((opts: ConfirmOptions) => new Promise<boolean>((resolve) => setState({ opts, resolve })), [])
  const close = (v: boolean) => { state?.resolve(v); setState(null) }
  return (
    <Ctx.Provider value={confirm}>
      {children}
      {state && <Dialog opts={state.opts} onClose={close} />}
    </Ctx.Provider>
  )
}

function Dialog({ opts, onClose }: { opts: ConfirmOptions; onClose: (v: boolean) => void }) {
  const [typed, setTyped] = useState('')
  const ref = useRef<HTMLDivElement>(null)
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  const ok = !opts.typeToConfirm || typed.trim() === opts.typeToConfirm

  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null
    ref.current?.querySelector<HTMLElement>('input, button.ghost')?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); closeRef.current(false) }
      if (e.key === 'Tab' && ref.current) {
        const f = Array.from(ref.current.querySelectorAll<HTMLElement>('input, button:not([disabled])'))
        if (!f.length) return
        const [a, z] = [f[0], f[f.length - 1]]
        if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus() }
        else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus() }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => { window.removeEventListener('keydown', onKey); prev?.focus?.() }
  }, [])

  return (
    <div className="confirm-backdrop" onMouseDown={() => onClose(false)}>
      <div ref={ref} className="confirm" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" onMouseDown={(e) => e.stopPropagation()}>
        <h2 id="confirm-title">{opts.title}</h2>
        {opts.body && <div className="confirm-body">{opts.body}</div>}
        {opts.typeToConfirm && (
          <label className="confirm-type">
            <span>Gõ <b>{opts.typeToConfirm}</b> để xác nhận</span>
            <input value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" spellCheck={false}
              onKeyDown={(e) => { if (e.key === 'Enter' && ok) onClose(true) }} />
          </label>
        )}
        <div className="confirm-actions">
          <button type="button" className="ghost" onClick={() => onClose(false)}>Quay lại</button>
          <button type="button" className="danger-solid" disabled={!ok} onClick={() => onClose(true)}>{opts.confirmLabel}</button>
        </div>
      </div>
    </div>
  )
}
