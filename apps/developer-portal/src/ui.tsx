// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 PeopleOS contributors

import { useCallback, useEffect, useState, type ReactNode } from 'react'

/** Tải dữ liệu + trạng thái lỗi/đang tải; `reload()` để làm mới sau khi thay đổi. */
export function useLoad<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(() => {
    setLoading(true)
    fn().then(d => { setData(d); setError(null) }).catch((e: Error) => setError(e.message)).finally(() => setLoading(false))
  }, deps)
  useEffect(run, [run])
  return { data, error, loading, reload: run }
}

export function ErrorBox({ message }: { message: string | null }) {
  return message ? <div className="error" role="alert">{message}</div> : null
}

export function Card({ title, children, right, className }: { title: string; children: ReactNode; right?: ReactNode; className?: string }) {
  return (
    <section className={className ? `card ${className}` : 'card'}>
      <header><h3>{title}</h3>{right}</header>
      <div className="card-body">{children}</div>
    </section>
  )
}

export function PageHead({ title, description, right }: { title: string; description?: ReactNode; right?: ReactNode }) {
  return (
    <div className="page-head">
      <div><h1>{title}</h1>{description && <p>{description}</p>}</div>
      {right}
    </div>
  )
}

function useCopy(): [boolean, (text: string) => void] {
  const [copied, setCopied] = useState(false)
  const copy = (text: string) => {
    void navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000) })
  }
  return [copied, copy]
}

/** Khối mã có nút sao chép. */
export function CodeBlock({ code }: { code: string }) {
  const [copied, copy] = useCopy()
  return (
    <div className="code">
      <pre><code>{code}</code></pre>
      <button type="button" onClick={() => copy(code)}>{copied ? 'Đã sao chép' : 'Sao chép'}</button>
    </div>
  )
}

/** Hiển thị MỘT LẦN một bí mật (API key, webhook secret) kèm nút sao chép. */
export function Secret({ label, value, onClose }: { label: string; value: string; onClose: () => void }) {
  const [copied, copy] = useCopy()
  return (
    <div className="secret" role="status">
      <strong>{label}</strong>
      <code>{value}</code>
      <small>Hãy lưu giá trị này ngay. Sau khi đóng, hệ thống sẽ không hiển thị lại.</small>
      <div className="row center">
        <button onClick={() => copy(value)}>{copied ? 'Đã sao chép' : 'Sao chép'}</button>
        <button className="ghost" onClick={onClose}>Tôi đã lưu, đóng lại</button>
      </div>
    </div>
  )
}

const STATUS_LABEL: Record<string, string> = {
  active: 'Đang hoạt động', provisioning: 'Đang khởi tạo', failed: 'Lỗi', deleting: 'Đang xóa', deleted: 'Đã xóa', suspended: 'Tạm khóa',
  pending: 'Đang chờ gửi', delivered: 'Đã giao',
}
export function Status({ value, failedLabel }: { value: string; failedLabel?: string }) {
  const label = value === 'failed' && failedLabel ? failedLabel : value === 'dead' ? 'Ngừng thử lại' : (STATUS_LABEL[value] ?? value)
  return <span className={`pill ${value}`}>{label}</span>
}

export const PLAN_LABEL: Record<string, string> = { free: 'Miễn phí', starter: 'Starter', pro: 'Pro', business: 'Business', enterprise: 'Enterprise' }
export const planLabel = (p: string) => PLAN_LABEL[p] ?? p

export const fmt = (iso: string): string => new Date(iso).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' })
export const num = (n: number): string => n.toLocaleString('vi-VN')

/* Biểu tượng nhỏ (SVG nội tuyến, không thêm thư viện) */
const svg = (d: ReactNode) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{d}</svg>
)
export const Icon = {
  menu: () => svg(<><path d="M4 6h16" /><path d="M4 12h16" /><path d="M4 18h16" /></>),
  close: () => svg(<><path d="M18 6 6 18" /><path d="m6 6 12 12" /></>),
  sun: () => svg(<><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>),
  moon: () => svg(<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />),
  logout: () => svg(<><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="m16 17 5-5-5-5" /><path d="M21 12H9" /></>),
  plus: () => svg(<><path d="M12 5v14" /><path d="M5 12h14" /></>),
}
