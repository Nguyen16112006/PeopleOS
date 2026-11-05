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

export function Card({ title, children, right }: { title: string; children: ReactNode; right?: ReactNode }) {
  return (
    <section className="card">
      <header><h3>{title}</h3>{right}</header>
      {children}
    </section>
  )
}

/** Hiển thị MỘT LẦN một bí mật (API key, webhook secret) kèm nút sao chép. */
export function Secret({ label, value, onClose }: { label: string; value: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false)
  return (
    <div className="secret" role="status">
      <strong>{label}</strong>
      <code>{value}</code>
      <div className="row">
        <button onClick={() => { void navigator.clipboard.writeText(value).then(() => setCopied(true)) }}>{copied ? 'Đã chép' : 'Sao chép'}</button>
        <button className="ghost" onClick={onClose}>Tôi đã lưu - đóng</button>
      </div>
      <small>Hệ thống sẽ không hiển thị lại giá trị này.</small>
    </div>
  )
}

export const fmt = (iso: string): string => new Date(iso).toLocaleString('vi-VN')
