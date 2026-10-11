import { useState } from 'react'
import { useAuth } from '@/auth/AuthProvider'
import { Empty, ErrorBox, errMsg, LeaveBadge, Loading, PageHeader } from '@/components/common'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, Input, Select, Textarea } from '@/components/ui/form'
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { useToast } from '@/hooks/toast'
import { useQuery } from '@/hooks/useQuery'
import { api } from '@/lib/api'
import { fmtDate, LEAVE_TYPES } from '@/lib/format'

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
  const { data, loading, error, reload } = useQuery<any>(Q, { uid: user.sub, year: new Date().getFullYear() })
  const [form, setForm] = useState({ leave_type: 'annual', start_date: today(), end_date: today(), reason: '' })
  const [sending, setSending] = useState(false)
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v, ...(k === 'start_date' && v > f.end_date ? { end_date: v } : {}) }))

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSending(true)
    try {
      const r = await api<{ days: number }>('/api/leave-requests', 'POST', form)
      push({ title: 'Đã gửi đơn nghỉ phép', message: `${r.days} ngày làm việc - đang chờ quản lý duyệt`, kind: 'success' })
      setForm((f) => ({ ...f, reason: '' }))
      reload()
    } catch (x) { push({ title: 'Không gửi được đơn', message: errMsg(x), kind: 'error' }) }
    finally { setSending(false) }
  }
  const cancel = async (id: string) => {
    try { await api(`/api/leave-requests/${id}/cancel`, 'POST'); push({ title: 'Đã huỷ đơn' }); reload() }
    catch (x) { push({ title: 'Không huỷ được', message: errMsg(x), kind: 'error' }) }
  }

  if (loading) return <Loading />
  if (error) return <ErrorBox message={error} />
  const bal = data.leave_balances[0]
  const left = bal ? Number(bal.entitled_days) - Number(bal.used_days) : 0

  return (
    <div>
      <PageHeader title="Nghỉ phép / Nghỉ ốm" description="Gửi đơn, theo dõi trạng thái duyệt. Bạn sẽ nhận thông báo realtime khi có kết quả." />
      <div className="grid gap-4 sm:grid-cols-3">
        <Card><CardHeader><CardDescription>Phép năm được hưởng</CardDescription><CardTitle className="text-2xl">{bal ? Number(bal.entitled_days) : '—'}</CardTitle></CardHeader></Card>
        <Card><CardHeader><CardDescription>Đã dùng</CardDescription><CardTitle className="text-2xl">{bal ? Number(bal.used_days) : '—'}</CardTitle></CardHeader></Card>
        <Card><CardHeader><CardDescription>Còn lại (nghỉ ốm đã dùng: {bal ? Number(bal.sick_days_used) : 0})</CardDescription><CardTitle className="text-2xl text-primary">{bal ? left : '—'}</CardTitle></CardHeader></Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader><CardTitle>Tạo đơn mới</CardTitle></CardHeader>
          <CardContent>
            <form onSubmit={submit} className="space-y-3">
              <Field label="Loại nghỉ">
                <Select value={form.leave_type} onChange={(e) => set('leave_type', e.target.value)}>
                  {Object.entries(LEAVE_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </Select>
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Từ ngày"><Input type="date" value={form.start_date} onChange={(e) => set('start_date', e.target.value)} required /></Field>
                <Field label="Đến ngày"><Input type="date" min={form.start_date} value={form.end_date} onChange={(e) => set('end_date', e.target.value)} required /></Field>
              </div>
              <Field label="Lý do"><Textarea value={form.reason} onChange={(e) => set('reason', e.target.value)} placeholder="Ví dụ: nghỉ phép năm, khám bệnh…" /></Field>
              <Button type="submit" disabled={sending} className="w-full">{sending ? 'Đang gửi…' : 'Gửi đơn'}</Button>
              <p className="text-xs text-muted-foreground">Số ngày được tính theo ngày làm việc (T2–T6), chưa trừ ngày lễ.</p>
            </form>
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Đơn của tôi</CardTitle></CardHeader>
          <CardContent>
            {data.leave_requests.length === 0 ? <Empty text="Bạn chưa có đơn nghỉ nào" /> : (
              <Table>
                <THead><TR><TH>Loại</TH><TH>Thời gian</TH><TH>Ngày</TH><TH>Trạng thái</TH><TH>Ghi chú</TH><TH /></TR></THead>
                <TBody>
                  {data.leave_requests.map((r: any) => (
                    <TR key={r.id}>
                      <TD>{LEAVE_TYPES[r.leave_type]}</TD>
                      <TD>{r.start_date === r.end_date ? fmtDate(r.start_date) : `${fmtDate(r.start_date)} → ${fmtDate(r.end_date)}`}</TD>
                      <TD>{Number(r.days)}</TD><TD><LeaveBadge status={r.status} /></TD>
                      <TD className="max-w-[12rem] truncate text-muted-foreground">{r.decision_note ? `${r.approver?.full_name ? r.approver.full_name + ': ' : ''}${r.decision_note}` : r.reason}</TD>
                      <TD>{r.status === 'pending' && <Button size="sm" variant="ghost" onClick={() => cancel(r.id)}>Huỷ</Button>}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
