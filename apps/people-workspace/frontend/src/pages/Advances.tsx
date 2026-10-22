import { useState } from 'react'
import { useAuth } from '@/auth/AuthProvider'
import { Empty, ErrorBox, errMsg, Loading, PageHeader } from '@/components/common'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, Input, Select, Textarea } from '@/components/ui/form'
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { useToast } from '@/hooks/toast'
import { useQuery } from '@/hooks/useQuery'
import { api } from '@/lib/api'
import { fmtDate, vnd } from '@/lib/format'

const TYPE_LABEL: Record<string, string> = { advance: 'Tạm ứng', expense: 'Thanh toán chi phí' }
const STAGE_LABEL: Record<string, string> = {
  manager: 'Chờ Quản lý duyệt', director: 'Chờ Giám đốc duyệt', director_l2: 'Chờ Giám đốc duyệt (cấp 2)',
  accountant: 'Chờ Kế toán kiểm tra và chi', paid: 'Đã chi tiền', settled: 'Đã quyết toán', closed: 'Hoàn tất',
}
const LEVEL2_THRESHOLD = 20_000_000

const QM = `query MyAdvances($uid: uuid!) {
  advance_requests(where: {employee: {user_id: {_eq: $uid}}}, order_by: {created_at: desc}) {
    id request_type amount reason stage status paid_at settled_amount settled_at created_at
  }
}`

const QQ = `query AdvanceQueue($where: advance_requests_bool_exp!) {
  advance_requests(where: $where, order_by: {created_at: asc}) {
    id request_type amount reason stage status settled_amount created_at employee { full_name department }
  }
}`

/** Điều kiện hàng đợi theo vai trò (Hasura còn lọc thêm theo quyền: Quản lý chỉ thấy nhóm mình). */
function queueFilter(role: string, uid: string): any | null {
  const notMine = { employee: { user_id: { _neq: uid } } }
  if (role === 'manager') return { _and: [notMine, { stage: { _eq: 'manager' } }, { status: { _eq: 'pending' } }] }
  if (role === 'director') return { _and: [notMine, { stage: { _in: ['director', 'director_l2'] } }, { status: { _eq: 'pending' } }] }
  if (role === 'accountant') return { _and: [notMine, { _or: [
    { stage: { _eq: 'accountant' }, status: { _eq: 'pending' } },
    { stage: { _eq: 'paid' }, settled_amount: { _is_null: false } },
  ] }] }
  return null
}

const StatusBadge = ({ r }: { r: any }) => (
  <Badge variant={r.status === 'rejected' ? 'destructive' : r.status === 'approved' ? 'success' : 'warning'}>
    {r.status === 'rejected' ? 'Bị từ chối' : STAGE_LABEL[r.stage] ?? r.stage}
  </Badge>
)

export default function Advances() {
  const { user } = useAuth()
  const { push } = useToast()
  const mine = useQuery<any>(QM, { uid: user.sub })
  const filter = queueFilter(user.role, user.sub)
  const queue = useQuery<any>(QQ, { where: filter ?? { id: { _is_null: true } } })
  const [form, setForm] = useState({ requestType: 'advance', amount: '', reason: '' })
  const [sending, setSending] = useState(false)
  const [settle, setSettle] = useState<Record<string, string>>({})

  const reloadAll = () => { mine.reload(); queue.reload() }
  const run = async (fn: () => Promise<unknown>, ok: string) => {
    try { await fn(); push({ title: ok, kind: 'success' }); reloadAll() }
    catch (x) { push({ title: 'Không thực hiện được', message: errMsg(x), kind: 'error' }) }
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSending(true)
    await run(() => api('/api/advance-requests', 'POST', { requestType: form.requestType, amount: Number(form.amount), reason: form.reason }), 'Đã gửi yêu cầu')
    setForm((f) => ({ ...f, amount: '', reason: '' }))
    setSending(false)
  }
  const decide = (id: string, decision: 'approve' | 'reject') => {
    const comment = decision === 'reject' ? window.prompt('Lý do từ chối (không bắt buộc)') ?? undefined : undefined
    return run(() => api(`/api/advance-requests/${id}/decision`, 'POST', { decision, comment }), decision === 'approve' ? 'Đã duyệt' : 'Đã từ chối')
  }

  if (mine.loading) return <Loading />
  if (mine.error) return <ErrorBox message={mine.error} />
  const amount = Number(form.amount || 0)

  return (
    <div>
      <PageHeader title="Tạm ứng và thanh toán chi phí" description="Quản lý duyệt cấp 1, Giám đốc duyệt thêm cấp 2 khi trên 20.000.000 đ, Kế toán kiểm tra chứng từ và chi tiền." />

      {filter && (
        <Card className="mb-4">
          <CardHeader><CardTitle>Chờ bạn xử lý</CardTitle></CardHeader>
          <CardContent>
            {queue.loading ? <Loading /> : queue.error ? <ErrorBox message={queue.error} /> : queue.data.advance_requests.length === 0 ? <Empty text="Không có yêu cầu nào đang chờ" /> : (
              <Table>
                <THead><TR><TH>Người gửi</TH><TH>Loại</TH><TH>Số tiền</TH><TH>Lý do</TH><TH>Giai đoạn</TH><TH /></TR></THead>
                <TBody>
                  {queue.data.advance_requests.map((r: any) => (
                    <TR key={r.id}>
                      <TD>{r.employee?.full_name}<div className="text-xs text-muted-foreground">{r.employee?.department}</div></TD>
                      <TD>{TYPE_LABEL[r.request_type]}</TD><TD>{vnd(r.amount)}</TD>
                      <TD className="max-w-[14rem] truncate text-muted-foreground">{r.reason}</TD>
                      <TD>{r.stage === 'paid' ? `Hoàn ứng ${vnd(r.settled_amount)} chờ đối chiếu` : STAGE_LABEL[r.stage]}</TD>
                      <TD className="whitespace-nowrap">
                        {r.stage === 'paid'
                          ? <Button size="sm" onClick={() => run(() => api(`/api/advance-requests/${r.id}/settle`, 'POST'), 'Đã quyết toán')}>Quyết toán</Button>
                          : <>
                              <Button size="sm" onClick={() => decide(r.id, 'approve')}>{r.stage === 'accountant' ? 'Duyệt và chi' : 'Duyệt'}</Button>{' '}
                              <Button size="sm" variant="ghost" onClick={() => decide(r.id, 'reject')}>Từ chối</Button>
                            </>}
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader><CardTitle>Tạo yêu cầu</CardTitle></CardHeader>
          <CardContent>
            <form onSubmit={submit} className="space-y-3">
              <Field label="Loại">
                <Select value={form.requestType} onChange={(e) => setForm((f) => ({ ...f, requestType: e.target.value }))}>
                  {Object.entries(TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </Select>
              </Field>
              <Field label="Số tiền (đ)"><Input type="number" min={1} value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} required /></Field>
              <Field label="Lý do"><Textarea value={form.reason} onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))} placeholder="Ví dụ: công tác khách hàng, mua thiết bị…" required minLength={5} /></Field>
              <Button type="submit" disabled={sending} className="w-full">{sending ? 'Đang gửi…' : 'Gửi yêu cầu'}</Button>
              <p className="text-xs text-muted-foreground">
                {amount > LEVEL2_THRESHOLD ? 'Khoản này vượt 20.000.000 đ nên cần Giám đốc duyệt thêm cấp 2.' : 'Khoản trên 20.000.000 đ cần Giám đốc duyệt thêm cấp 2.'}
                {user.role === 'director' ? ' Yêu cầu của Giám đốc chuyển thẳng cho Kế toán.' : user.role === 'employee' ? '' : ' Yêu cầu của bạn do Giám đốc duyệt cấp 1.'}
              </p>
            </form>
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Yêu cầu của tôi</CardTitle></CardHeader>
          <CardContent>
            {mine.data.advance_requests.length === 0 ? <Empty text="Bạn chưa có yêu cầu nào" /> : (
              <Table>
                <THead><TR><TH>Ngày gửi</TH><TH>Loại</TH><TH>Số tiền</TH><TH>Trạng thái</TH><TH /></TR></THead>
                <TBody>
                  {mine.data.advance_requests.map((r: any) => (
                    <TR key={r.id}>
                      <TD>{fmtDate(r.created_at)}</TD><TD>{TYPE_LABEL[r.request_type]}</TD><TD>{vnd(r.amount)}</TD>
                      <TD><StatusBadge r={r} /></TD>
                      <TD className="whitespace-nowrap">
                        {r.request_type === 'advance' && r.stage === 'paid' && r.settled_amount == null && (
                          <span className="inline-flex items-center gap-2">
                            <Input className="h-8 w-32" type="number" min={0} placeholder="Chi thực tế" value={settle[r.id] ?? ''} onChange={(e) => setSettle((s) => ({ ...s, [r.id]: e.target.value }))} />
                            <Button size="sm" disabled={!settle[r.id]} onClick={() => run(() => api(`/api/advance-requests/${r.id}/settlement`, 'POST', { settledAmount: Number(settle[r.id]) }), 'Đã khai hoàn ứng')}>Hoàn ứng</Button>
                          </span>
                        )}
                        {r.stage === 'paid' && r.settled_amount != null && <span className="text-xs text-muted-foreground">Đã khai {vnd(r.settled_amount)}, chờ Kế toán đối chiếu</span>}
                      </TD>
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
