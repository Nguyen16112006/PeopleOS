// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 PeopleOS contributors

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'

/**
 * Hộp xác nhận dùng chung, thay cho window.prompt / window.confirm.
 * - Bấm "Huỷ", Esc hoặc bấm ra ngoài: huỷ thật, không gửi gì.
 * - `note.required`: bắt buộc nhập lý do (từ chối, trả lại) trước khi xác nhận.
 * - `summary`: các con số người dùng cần thấy trước khi làm việc không đảo ngược được.
 */
export interface ConfirmOptions {
  title: string
  body?: ReactNode
  summary?: { label: string; value: ReactNode; caution?: boolean; emphasis?: boolean }[]
  /** Lời cảnh báo màu hổ phách đặt trên các nút: việc vẫn làm được nhưng cần người dùng chủ động chấp nhận. */
  caution?: ReactNode
  confirmLabel: string
  /** Nhãn nút đóng; mặc định "Huỷ", hoặc "Quay lại" khi chính hành động là huỷ một thứ gì đó. */
  cancelLabel?: string
  tone?: 'primary' | 'danger'
  note?: { label: string; required?: boolean; placeholder?: string; minLength?: number }
}
export type ConfirmResult = { note?: string } | null

const Ctx = createContext<(o: ConfirmOptions) => Promise<ConfirmResult>>(async () => null)
export const useConfirm = () => useContext(Ctx)

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{ opts: ConfirmOptions; resolve: (r: ConfirmResult) => void } | null>(null)
  const confirm = useCallback((opts: ConfirmOptions) => new Promise<ConfirmResult>((resolve) => setState({ opts, resolve })), [])
  const close = (r: ConfirmResult) => { state?.resolve(r); setState(null) }
  return (
    <Ctx.Provider value={confirm}>
      {children}
      {state && <ConfirmDialog opts={state.opts} onClose={close} />}
    </Ctx.Provider>
  )
}

function ConfirmDialog({ opts, onClose }: { opts: ConfirmOptions; onClose: (r: ConfirmResult) => void }) {
  const [note, setNote] = useState('')
  const [touched, setTouched] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  const min = opts.note?.minLength ?? (opts.note?.required ? 5 : 0)
  const invalid = !!opts.note?.required && note.trim().length < min

  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null
    const first = ref.current?.querySelector<HTMLElement>('textarea, button[data-confirm]')
    first?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); closeRef.current(null) }
      if (e.key === 'Tab' && ref.current) {
        const f = Array.from(ref.current.querySelectorAll<HTMLElement>('textarea, button:not([disabled])'))
        if (!f.length) return
        const [a, z] = [f[0], f[f.length - 1]]
        if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus() }
        else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus() }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => { window.removeEventListener('keydown', onKey); prev?.focus?.() }
  }, [])

  const submit = () => {
    setTouched(true)
    if (invalid) return
    onClose({ note: note.trim() || undefined })
  }

  return (
    <div className="po-modal-backdrop po-confirm-backdrop" onMouseDown={() => onClose(null)}>
      <div ref={ref} className="po-confirm" role="alertdialog" aria-modal="true" aria-labelledby="po-confirm-title"
        aria-describedby={opts.body ? 'po-confirm-body' : undefined} onMouseDown={(e) => e.stopPropagation()}>
        <h2 id="po-confirm-title">{opts.title}</h2>
        {opts.body && <div id="po-confirm-body" className="po-confirm-body">{opts.body}</div>}
        {opts.summary && opts.summary.length > 0 && (
          <dl className="po-confirm-summary">
            {opts.summary.map((s) => (
              <div key={s.label} className={[s.caution && 'caution', s.emphasis && 'emphasis'].filter(Boolean).join(' ') || undefined}>
                <dt>{s.label}</dt><dd>{s.value}</dd>
              </div>
            ))}
          </dl>
        )}
        {opts.caution && <p className="po-confirm-caution" role="note">{opts.caution}</p>}
        {opts.note && (
          <label className="po-confirm-note">
            <span>{opts.note.label}{opts.note.required ? '' : ' (không bắt buộc)'}</span>
            <textarea value={note} rows={3} placeholder={opts.note.placeholder} onChange={(e) => setNote(e.target.value)}
              aria-invalid={touched && invalid} onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) submit() }} />
            {touched && invalid && <em role="alert">Hãy ghi lý do (ít nhất {min} ký tự) để người nhận biết cần sửa gì.</em>}
          </label>
        )}
        <div className="po-confirm-actions">
          <button type="button" className="po-btn po-btn-secondary" onClick={() => onClose(null)}>
            {opts.cancelLabel ?? (/^huỷ|^hủy/i.test(opts.confirmLabel) ? 'Quay lại' : 'Huỷ')}
          </button>
          <button type="button" data-confirm className={opts.tone === 'danger' ? 'po-btn po-btn-danger' : 'po-btn po-btn-primary'} onClick={submit}>
            {opts.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
