// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 PeopleOS contributors

import { useEffect, useState } from 'react'
import { call, type Project } from './api'
import { login, logout, userEmail } from './auth'
import { Card, ErrorBox, Icon, PageHead, Status, fmt, planLabel, useLoad } from './ui'
import ProjectView, { SECTIONS, type Section } from './ProjectView'

function useTheme() {
  const [dark, setDark] = useState(() => {
    try {
      const saved = localStorage.getItem('peopleos-theme')
      return saved ? saved === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches
    } catch { return false }
  })
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
    try { localStorage.setItem('peopleos-theme', dark ? 'dark' : 'light') } catch { /* trình duyệt chặn lưu trữ */ }
  }, [dark])
  return { dark, toggle: () => setDark(d => !d) }
}

export default function App() {
  const [ready, setReady] = useState(false)
  const [authError, setAuthError] = useState<string | null>(null)

  useEffect(() => {
    login().then(ok => setReady(ok)).catch((e: Error) => setAuthError(e.message))
  }, [])

  if (authError) return <div className="content"><ErrorBox message={`Không đăng nhập được: ${authError}. Kiểm tra Keycloak đã chạy chưa.`} /></div>
  if (!ready) return <p className="loading-screen">Đang chuyển tới trang đăng nhập…</p>
  return <Portal />
}

function Portal() {
  const projects = useLoad(() => call<Project[]>('/v1/projects'), [])
  const [selected, setSelected] = useState<string | null>(null)
  const [section, setSection] = useState<Section>('overview')
  const [menuOpen, setMenuOpen] = useState(false)
  const { dark, toggle } = useTheme()
  const email = userEmail()
  const current = projects.data?.find(p => p.id === selected) ?? null

  const open = (id: string | null, s: Section = 'overview') => { setSelected(id); setSection(s); setMenuOpen(false); window.scrollTo(0, 0) }

  return (
    <div className="shell">
      <div className={menuOpen ? 'backdrop show' : 'backdrop'} onClick={() => setMenuOpen(false)} />
      <aside className={menuOpen ? 'sidebar open' : 'sidebar'} aria-label="Menu">
        <div className="brand">
          <div className="brand-mark" aria-hidden="true">P</div>
          <div><strong>PeopleOS</strong><span>Cổng lập trình viên</span></div>
          <button className="icon-btn sidebar-close" onClick={() => setMenuOpen(false)} aria-label="Đóng menu"><Icon.close /></button>
        </div>

        <nav className="side-nav">
          <div className="side-group">
            <button className={!selected ? 'side-link active' : 'side-link'} onClick={() => open(null)}>Tất cả dự án</button>
          </div>
          <div className="side-group">
            <p className="side-label">Dự án của bạn</p>
            {projects.data?.length === 0 && <p className="side-empty">Chưa có dự án nào.</p>}
            {projects.data?.map(p => (
              <div key={p.id}>
                <button className={p.id === selected && section === 'overview' ? 'side-link active' : 'side-link'} onClick={() => open(p.id)}
                  aria-current={p.id === selected ? 'page' : undefined}>
                  <span className={`dot ${p.status}`} aria-hidden="true" /><span className="name">{p.name}</span>
                </button>
                {p.id === selected && (
                  <div className="side-sub">
                    {SECTIONS.filter(s => s.key !== 'overview').map(s => (
                      <button key={s.key} className={section === s.key ? 'side-link active' : 'side-link'} onClick={() => open(p.id, s.key)}>{s.label}</button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </nav>

        <div className="account">
          <div className="avatar" aria-hidden="true">{email.slice(0, 1).toUpperCase()}</div>
          <div className="account-copy" title={email}>{email}</div>
          <button className="icon-btn" onClick={() => void logout()} aria-label="Đăng xuất" title="Đăng xuất"><Icon.logout /></button>
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <button className="icon-btn menu-toggle" onClick={() => setMenuOpen(true)} aria-label="Mở menu"><Icon.menu /></button>
          <div className="crumbs">
            {current ? (
              <><button onClick={() => open(null)}>Dự án</button><span className="sep">/</span><strong>{current.name}</strong></>
            ) : <strong>Dự án</strong>}
          </div>
          <div className="top-actions">
            <a className="top-link" href="https://github.com/Nguyen16112006/PeopleOS/blob/main/docs/api-reference.md" target="_blank" rel="noreferrer">Tài liệu API</a>
            <button className="icon-btn" onClick={toggle} aria-label={dark ? 'Chuyển sang nền sáng' : 'Chuyển sang nền tối'} title={dark ? 'Nền sáng' : 'Nền tối'}>
              {dark ? <Icon.sun /> : <Icon.moon />}
            </button>
          </div>
        </header>

        <main className="content">
          {selected
            ? <ProjectView id={selected} section={section} onSection={s => open(selected, s)} onDeleted={() => { open(null); projects.reload() }} />
            : <Projects list={projects} onOpen={id => open(id)} />}
        </main>
      </div>
    </div>
  )
}

function Projects({ list, onOpen }: { list: ReturnType<typeof useLoad<Project[]>>; onOpen: (id: string) => void }) {
  const { data, error, loading, reload } = list
  const [name, setName] = useState('')
  const [redirect, setRedirect] = useState('')
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  async function create() {
    setBusy(true); setFormError(null)
    try {
      const p = await call<Project>('/v1/projects', { method: 'POST', body: { name, redirect_uris: redirect.split(/[\s,]+/).filter(Boolean) } })
      setName(''); setRedirect(''); reload(); onOpen(p.id)
    } catch (e) { setFormError((e as Error).message) } finally { setBusy(false) }
  }

  return (
    <>
      <PageHead title="Dự án"
        description="Mỗi dự án là một công ty (tenant) riêng trên PeopleOS, có dữ liệu tách biệt, API key và webhook riêng. Ứng dụng của bạn gọi API bằng khóa của dự án." />

      <section className="card">
        <header><h3>Dự án của bạn</h3></header>
        <ErrorBox message={error} />
        {loading && !data && <p className="empty">Đang tải danh sách dự án…</p>}
        {data?.length === 0 && <p className="empty">Bạn chưa có dự án nào. Tạo dự án đầu tiên ở mục bên dưới.</p>}
        <ul className="project-list">
          {data?.map(p => (
            <li key={p.id}>
              <button className="row-btn" onClick={() => onOpen(p.id)}>
                <span className="grow">
                  <span className="p-name">{p.name}</span>
                  <span className="p-meta">Mã <code>{p.short_id}</code>, gói {planLabel(p.plan)}, tạo lúc {fmt(p.created_at)}</span>
                </span>
                <Status value={p.status} failedLabel="Khởi tạo lỗi" />
              </button>
            </li>
          ))}
        </ul>
      </section>

      <Card title="Tạo dự án mới">
        <ErrorBox message={formError} />
        <p className="hint">Hệ thống sẽ tạo tenant, vùng dữ liệu riêng và client đăng nhập cho ứng dụng của bạn. Việc này mất vài giây.</p>
        <label>Tên dự án<input value={name} onChange={e => setName(e.target.value)} placeholder="Ví dụ: Nhân sự Công ty An Phát" /></label>
        <label>Địa chỉ chuyển hướng sau đăng nhập <span className="opt">(không bắt buộc, cách nhau bằng dấu phẩy)</span>
          <input value={redirect} onChange={e => setRedirect(e.target.value)} placeholder="https://app.anphat.vn/*" />
        </label>
        <button disabled={busy || name.trim().length < 3} onClick={() => void create()}>{busy ? 'Đang tạo dự án…' : 'Tạo dự án'}</button>
      </Card>
    </>
  )
}
