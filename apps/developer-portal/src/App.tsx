// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 PeopleOS contributors

import { useEffect, useState } from 'react'
import { call, type Project } from './api'
import { login, logout, userEmail } from './auth'
import { Card, ErrorBox, fmt, useLoad } from './ui'
import ProjectView from './ProjectView'

export default function App() {
  const [ready, setReady] = useState(false)
  const [authError, setAuthError] = useState<string | null>(null)
  const [selected, setSelected] = useState<string | null>(null)

  useEffect(() => {
    login().then(ok => setReady(ok)).catch((e: Error) => setAuthError(e.message))
  }, [])

  if (authError) return <ErrorBox message={`Không đăng nhập được: ${authError}`} />
  if (!ready) return <p className="center">Đang chuyển tới trang đăng nhập...</p>

  return (
    <>
      <nav className="top">
        <strong onClick={() => setSelected(null)} role="link" tabIndex={0}>PeopleOS Developer Portal</strong>
        <span>{userEmail()} <button className="ghost" onClick={() => void logout()}>Đăng xuất</button></span>
      </nav>
      <main>{selected ? <ProjectView id={selected} onBack={() => setSelected(null)} /> : <Projects onOpen={setSelected} />}</main>
    </>
  )
}

function Projects({ onOpen }: { onOpen: (id: string) => void }) {
  const { data, error, loading, reload } = useLoad(() => call<Project[]>('/v1/projects'), [])
  const [name, setName] = useState('')
  const [redirect, setRedirect] = useState('')
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  async function create() {
    setBusy(true); setFormError(null)
    try {
      await call<Project>('/v1/projects', { method: 'POST', body: { name, redirect_uris: redirect.split(/[\s,]+/).filter(Boolean) } })
      setName(''); setRedirect(''); reload()
    } catch (e) { setFormError((e as Error).message) } finally { setBusy(false) }
  }

  return (
    <>
      <Card title="Project của bạn">
        <ErrorBox message={error} />
        {loading && <p>Đang tải...</p>}
        {data?.length === 0 && <p>Chưa có project. Hãy tạo project đầu tiên bên dưới.</p>}
        <ul className="list">
          {data?.map(p => (
            <li key={p.id}>
              <button className="link" onClick={() => onOpen(p.id)}>{p.name}</button>
              <span className={`pill ${p.status}`}>{p.status}</span>
              <small>gói {p.plan} · mã {p.short_id} · {fmt(p.created_at)}</small>
            </li>
          ))}
        </ul>
      </Card>
      <Card title="Tạo project mới">
        <ErrorBox message={formError} />
        <label>Tên project<input value={name} onChange={e => setName(e.target.value)} placeholder="Acme HR" /></label>
        <label>Redirect URI của ứng dụng (tùy chọn, cách nhau bởi dấu phẩy)
          <input value={redirect} onChange={e => setRedirect(e.target.value)} placeholder="https://app.acme.vn/*" />
        </label>
        <button disabled={busy || name.trim().length < 3} onClick={() => void create()}>{busy ? 'Đang cấp phát...' : 'Tạo project'}</button>
      </Card>
    </>
  )
}
