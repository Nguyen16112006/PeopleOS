// SPDX-License-Identifier: Apache-2.0
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
import { fmtDateTime } from '@/lib/format'

const SCOPES: Record<string, string> = { payrolls: 'Bảng lương', contracts: 'Hợp đồng', insurance_records: 'Bảo hiểm', employees: 'Hồ sơ nhân viên' }
const OWNERS: Record<string, string> = { hr: 'HR (hồ sơ, hợp đồng)', accountant: 'Kế toán (lương, bảo hiểm)' }
const STATUS: Record<string, string> = { pending: 'Chờ duyệt', approved: 'Đang có hiệu lực', rejected: 'Bị từ chối', expired: 'Đã hết hạn', revoked: 'Đã thu hồi' }

const Q = `query TempAccess($where: temp_access_requests_bool_exp!) {
  temp_access_requests(where: $where, order_by: {created_at: desc}, limit: 100) {
    id scope data_owner_role reason duration_minutes status owner_approved_at director_approved_at expires_at created_at
    requester { full_name }
  }
}`

const StatusBadge = ({ s }: { s: string }) => (
  <Badge variant={s === 'approved' ? 'success' : s === 'rejected' || s === 'revoked' ? 'destructive' : s === 'pending' ? 'warning' : 'secondary'}>{STATUS[s] ?? s}</Badge>
)

export default function TempAccess() {
  const { user } = useAuth()
  const { push } = useToast()
  const isAdmin = user.role === 'sysadmin'
  // Admin chỉ thấy yêu cầu của mình (Hasura lọc); HR/Kế toán thấy yêu cầu thuộc dữ liệu của họ; Giám đốc thấy tất cả
  const { data, loading, error, reload } = useQuery<any>(Q, { where: {} })
  const [form, setForm] = useState({ scope: 'payrolls', dataOwnerRole: 'accountant', reason: '', durationMinutes: '30' })
  const [sending, setSending] = useState(false)

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    try { await fn(); push({ title: ok, kind: 'success' }); reload() }
    catch (x) { push({ title: 'Không thực hiện được', message: errMsg(x), kind: 'error' }) }
  }
  const create = async (e: React.FormEvent) => {
    e.preventDefault()
    setSending(true)
    await run(() => api('/api/temp-access-requests', 'POST', { ...form, durationMinutes: Number(form.durationMinutes) }), 'Đã gửi yêu cầu cấp quyền')
    setForm((f) => ({ ...f, reason: '' }))
    setSending(false)
  }
  const decide = (id: string, decision: 'approve' | 'reject') => {
    const comment = decision === 'reject' ? window.prompt('Lý do từ chối (không bắt buộc)') ?? undefined : undefined
    return run(() => api(`/api/temp-access-requests/${id}/decision`, 'POST', { decision, comment }), decision === 'approve' ? 'Đã duyệt' : 'Đã từ chối')
  }
  const canDecide = (r: any) => {
    if (r.status !== 'pending') return false
    if (user.role === 'director') return !r.director_approved_at
    return user.role === r.data_owner_role && !r.owner_approved_at
  }

  if (loading) return <Loading />
  if (error) return <ErrorBox message={error} />
  const rows: any[] = data.temp_access_requests

  return (
    <div>
      <PageHeader title="Quyền truy cập tạm thời" description="Admin xin quyền khi xử lý sự cố. Cần cả chủ sở hữu dữ liệu và Giám đốc cùng duyệt; quyền tự hết hạn và mọi thao tác được ghi nhật ký." />
      <div className={`grid gap-4 ${isAdmin ? 'lg:grid-cols-3' : ''}`}>
        {isAdmin && (
          <Card className="lg:col-span-1">
            <CardHeader><CardTitle>Tạo yêu cầu</CardTitle></CardHeader>
            <CardContent>
              <form onSubmit={create} className="space-y-3">
                <Field label="Phạm vi dữ liệu">
                  <Select value={form.scope} onChange={(e) => setForm((f) => ({ ...f, scope: e.target.value }))}>
                    {Object.entries(SCOPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </Select>
                </Field>
                <Field label="Chủ sở hữu dữ liệu">
                  <Select value={form.dataOwnerRole} onChange={(e) => setForm((f) => ({ ...f, dataOwnerRole: e.target.value }))}>
                    {Object.entries(OWNERS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </Select>
                </Field>
                <Field label="Thời hạn (phút, 5 đến 1440)"><Input type="number" min={5} max={1440} value={form.durationMinutes} onChange={(e) => setForm((f) => ({ ...f, durationMinutes: e.target.value }))} required /></Field>
                <Field label="Lý do (tối thiểu 10 ký tự)"><Textarea value={form.reason} onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))} required minLength={10} placeholder="Ví dụ: khắc phục lỗi hiển thị phiếu lương tháng 9" /></Field>
                <Button type="submit" disabled={sending} className="w-full">{sending ? 'Đang gửi…' : 'Gửi yêu cầu'}</Button>
              </form>
            </CardContent>
          </Card>
        )}
        <Card className={isAdmin ? 'lg:col-span-2' : ''}>
          <CardHeader><CardTitle>{isAdmin ? 'Yêu cầu của tôi' : 'Yêu cầu cấp quyền'}</CardTitle></CardHeader>
          <CardContent>
            {rows.length === 0 ? <Empty text="Chưa có yêu cầu nào" /> : (
              <Table>
                <THead><TR><TH>Người xin</TH><TH>Phạm vi</TH><TH>Thời hạn</TH><TH>Duyệt</TH><TH>Trạng thái</TH><TH /></TR></THead>
                <TBody>
                  {rows.map((r) => (
                    <TR key={r.id}>
                      <TD>{r.requester?.full_name}<div className="max-w-[14rem] truncate text-xs text-muted-foreground">{r.reason}</div></TD>
                      <TD>{SCOPES[r.scope] ?? r.scope}<div className="text-xs text-muted-foreground">Chủ dữ liệu: {r.data_owner_role === 'hr' ? 'HR' : 'Kế toán'}</div></TD>
                      <TD>{r.duration_minutes} phút{r.expires_at && <div className="text-xs text-muted-foreground">đến {fmtDateTime(r.expires_at)}</div>}</TD>
                      <TD className="text-xs">{r.owner_approved_at ? '✓' : '○'} Chủ dữ liệu<br />{r.director_approved_at ? '✓' : '○'} Giám đốc</TD>
                      <TD><StatusBadge s={r.status} /></TD>
                      <TD className="whitespace-nowrap">
                        {canDecide(r) && <>
                          <Button size="sm" onClick={() => decide(r.id, 'approve')}>Duyệt</Button>{' '}
                          <Button size="sm" variant="ghost" onClick={() => decide(r.id, 'reject')}>Từ chối</Button>
                        </>}
                        {r.status === 'approved' && (user.role === 'director' || isAdmin) &&
                          <Button size="sm" variant="ghost" onClick={() => run(() => api(`/api/temp-access-requests/${r.id}/revoke`, 'POST'), 'Đã thu hồi quyền')}>Thu hồi</Button>}
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
