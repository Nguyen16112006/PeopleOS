// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 PeopleOS contributors
import { Loader2, Send } from 'lucide-react'
import { useState } from 'react'
import { useAuth } from '@/auth/AuthProvider'
import { Empty, ErrorBox, errMsg, LeaveBadge, Loading, PageHeader } from '@/components/common'
import { Seal } from '@/components/Stamp'
import { Field, Input, Select, Textarea } from '@/components/ui/form'
import { useConfirm } from '@/hooks/confirm'
import { useToast } from '@/hooks/toast'
import { useQuery } from '@/hooks/useQuery'
import { api } from '@/lib/api'
import { fmtDate, fmtDays, LEAVE_TYPES } from '@/lib/format'

const Q = `query MyLeave($uid: uuid!, $year: smallint!) {
  leave_balances(where: {employee: {user_id: {_eq: $uid}}, year: {_eq: $year}}) { entitled_days used_days sick_days_used }
  leave_requests(where: {employee: {user_id: {_eq: $uid}}}, order_by: {created_at: desc}) {
    id leave_type start_date end_date days reason status decision_note approver { full_name }
  }
}`

const today = () => new Date().toISOString().slice(0, 10)

export default function Leave() {
  const { user } = useAuth()
  const { push } = useToast()
  const confirm = useConfirm()
  const { data, loading, error, reload } = useQuery<any>(Q, {
    uid: user.sub,
    year: new Date().getFullYear(),
  })
  const [form, setForm] = useState({
    leave_type: 'annual',
    start_date: today(),
    end_date: today(),
    reason: '',
  })
  const [sending, setSending] = useState(false)
  const set = (k: string, v: string) =>
    setForm((f) => ({
      ...f,
      [k]: v,
      ...(k === 'start_date' && v > f.end_date ? { end_date: v } : {}),
    }))

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSending(true)
    try {
      const r = await api<{ days: number }>('/api/leave-requests', 'POST', form)
      push({
        title: 'Đã gửi đơn nghỉ phép',
        message: `${r.days} ngày làm việc - đang chờ quản lý duyệt`,
        kind: 'success',
      })
      setForm((f) => ({ ...f, reason: '' }))
      reload()
    } catch (x) {
      push({ title: 'Không gửi được đơn', message: errMsg(x), kind: 'error' })
    } finally {
      setSending(false)
    }
  }

  const cancel = async (r: any) => {
    const ok = await confirm({ title: 'Huỷ đơn nghỉ này?', body: `${LEAVE_TYPES[r.leave_type] ?? r.leave_type}, ${fmtDate(r.start_date)}${r.start_date !== r.end_date ? ` đến ${fmtDate(r.end_date)}` : ''}. Người duyệt sẽ không thấy đơn nữa.`, confirmLabel: 'Huỷ đơn', tone: 'danger' })
    if (!ok) return
    const id = r.id
    try {
      await api(`/api/leave-requests/${id}/cancel`, 'POST')
      push({ title: 'Đã huỷ đơn', kind: 'success' })
      reload()
    } catch (x) {
      push({ title: 'Không huỷ được', message: errMsg(x), kind: 'error' })
    }
  }

  if (loading) return <Loading />
  if (error) return <ErrorBox message={error} onRetry={reload} />
  const bal = data.leave_balances[0]
  const entitled = bal ? Number(bal.entitled_days) : null
  const used = bal ? Number(bal.used_days) : 0
  const left = entitled != null ? entitled - used : null
  const list: any[] = data.leave_requests

  return (
    <div>
      <PageHeader title="Nghỉ phép" description="Xin nghỉ phép năm, nghỉ ốm, nghỉ việc riêng và theo dõi đơn đã gửi." />

      <section className="po-panel po-figures" aria-label="Số ngày phép năm nay">
        <div className="po-figure">
          <div className="po-figure-label">Phép năm còn lại</div>
          <div className="po-figure-value">{left != null ? fmtDays(left) : '—'}<small>/ {entitled != null ? fmtDays(entitled) : '—'} ngày</small></div>
          {entitled ? <div className="po-meter" aria-hidden="true"><i style={{ width: `${Math.max(0, Math.min(100, ((left ?? 0) / entitled) * 100))}%` }} /></div> : null}
        </div>
        <div className="po-figure">
          <div className="po-figure-label">Phép năm đã dùng</div>
          <div className="po-figure-value">{bal ? fmtDays(used) : '—'}<small>ngày</small></div>
        </div>
        <div className="po-figure">
          <div className="po-figure-label">Nghỉ ốm đã dùng</div>
          <div className="po-figure-value">{bal ? Number(bal.sick_days_used) : '—'}<small>ngày</small></div>
          <div className="po-figure-note">Hưởng chế độ BHXH, không trừ phép năm</div>
        </div>
      </section>

      <div className="po-dash-cols">
        <section className="po-panel" aria-labelledby="leave-history">
          <div className="po-panel-head"><h2 id="leave-history">Đơn đã gửi</h2><span className="text-[14px] text-muted-foreground">{list.length} đơn</span></div>
          {list.length === 0 ? <div className="p-5"><Empty text="Bạn chưa gửi đơn nghỉ nào." /></div> : (
            <ul className="po-list">
              {list.map((r) => (
                <li key={r.id}>
                  <div className="po-list-main">
                    <strong>{LEAVE_TYPES[r.leave_type] ?? r.leave_type} · {fmtDays(r.days)} ngày</strong>
                    <span>{r.start_date === r.end_date ? fmtDate(r.start_date) : `${fmtDate(r.start_date)} đến ${fmtDate(r.end_date)}`}</span>
                    {(r.decision_note || r.reason) && (
                      <span className="po-list-note">{r.decision_note ? `${r.approver?.full_name ? r.approver.full_name + ': ' : ''}${r.decision_note}` : r.reason}</span>
                    )}
                  </div>
                  <div className="po-list-side">
                    {r.status === 'approved' ? <Seal label="Đã duyệt" /> : <LeaveBadge status={r.status} />}
                    {r.status === 'pending' && <button type="button" className="po-link-danger" onClick={() => cancel(r)}>Huỷ đơn</button>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="po-panel" aria-labelledby="leave-new">
          <div className="po-panel-head"><h2 id="leave-new">Xin nghỉ</h2></div>
          <form onSubmit={submit} className="space-y-4 p-5">
            <Field label="Loại nghỉ">
              <Select value={form.leave_type} onChange={(e) => set('leave_type', e.target.value)}>
                {Object.entries(LEAVE_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </Select>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Từ ngày"><Input type="date" lang="vi" value={form.start_date} onChange={(e) => set('start_date', e.target.value)} required /></Field>
              <Field label="Đến ngày"><Input type="date" lang="vi" min={form.start_date} value={form.end_date} onChange={(e) => set('end_date', e.target.value)} required /></Field>
            </div>
            <Field label="Lý do">
              <Textarea value={form.reason} onChange={(e) => set('reason', e.target.value)} rows={3} placeholder="Ví dụ: việc gia đình, khám bệnh…" />
            </Field>
            <button type="submit" disabled={sending} className="po-btn po-btn-primary w-full">
              {sending ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Send aria-hidden="true" />}
              {sending ? 'Đang gửi…' : 'Gửi đơn'}
            </button>
            <p className="text-[13.5px] text-muted-foreground">Số ngày tính theo ngày làm việc thứ 2 đến thứ 6, không tính ngày lễ. Đơn đi qua quản lý trực tiếp trước.</p>
          </form>
        </section>
      </div>
    </div>
  )
}
