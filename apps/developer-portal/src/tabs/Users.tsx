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
    <Card title="Tạo người dùng cho ứng dụng của bạn">
      <p><small>Người dùng đăng nhập bằng client OIDC <code>app-&lt;mã project&gt;</code>; token của họ mang claim <code>tenant_id</code> của project này. Mật khẩu tạm, bắt đổi ở lần đăng nhập đầu.</small></p>
      <ErrorBox message={err} />
      {done && <p className="ok">Đã tạo người dùng <code>{done}</code>.</p>}
      <label>Tên đăng nhập<input value={username} onChange={e => setUsername(e.target.value)} placeholder="nguyenvana" /></label>
      <label>Email<input type="email" value={email} onChange={e => setEmail(e.target.value)} /></label>
      <label>Mật khẩu tạm (≥ 10 ký tự)<input type="password" value={password} onChange={e => setPassword(e.target.value)} /></label>
      <button disabled={!username || !email || password.length < 10} onClick={() => void create()}>Tạo người dùng</button>
    </Card>
  )
}
