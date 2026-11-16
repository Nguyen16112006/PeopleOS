// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 PeopleOS contributors

import { useState } from 'react'
import { call } from '../api'
import { Card, ErrorBox } from '../ui'

export default function Users({ projectId }: { projectId: string }) {
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [done, setDone] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  async function create() {
    setErr(null); setDone(null)
    try {
      const r = await call<{ username: string }>(`/v1/projects/${projectId}/users`, { method: 'POST', body: { username, email, password } })
      setDone(r.username); setUsername(''); setEmail(''); setPassword('')
    } catch (e) { setErr((e as Error).message) }
  }

  return (
    <Card title="Tạo tài khoản người dùng">
      <p className="hint">
        Người dùng đăng nhập qua client OIDC <code>app-&lt;mã dự án&gt;</code>. Token của họ mang claim <code>tenant_id</code> của dự án này,
        nên chỉ thấy dữ liệu của dự án. Mật khẩu là mật khẩu tạm, người dùng phải đổi ở lần đăng nhập đầu tiên.
      </p>
      <ErrorBox message={err} />
      {done && <p className="ok" role="status">Đã tạo tài khoản <code>{done}</code>. Gửi tên đăng nhập và mật khẩu tạm cho người dùng.</p>}
      <div className="row">
        <label>Tên đăng nhập<input value={username} onChange={e => setUsername(e.target.value)} placeholder="nguyenvana" autoComplete="off" /></label>
        <label>Email<input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="vana@anphat.vn" autoComplete="off" /></label>
      </div>
      <label style={{ marginTop: 14 }}>Mật khẩu tạm <span className="opt">(ít nhất 10 ký tự)</span>
        <input type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="new-password" />
      </label>
      <button disabled={!username || !email || password.length < 10} onClick={() => void create()}>Tạo tài khoản</button>
    </Card>
  )
}
