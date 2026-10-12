import { Copy } from 'lucide-react'
import { useState } from 'react'
import { Empty, ErrorBox, errMsg, Loading, PageHeader } from '@/components/common'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, Input, Select } from '@/components/ui/form'
import { useToast } from '@/hooks/toast'
import { useQuery } from '@/hooks/useQuery'
import { api } from '@/lib/api'
import { ASSIGNEE_LABEL, CONTRACT_TYPES, fmtDate } from '@/lib/format'

const Q = `query Onboarding {
  managers: employees(where: {status: {_neq: "terminated"}}, order_by: {full_name: asc}) { id full_name job_title }
  onboarding: employees(where: {status: {_eq: "onboarding"}}, order_by: {hire_date: desc}) {
    id full_name job_title hire_date employee_code manager { full_name }
    onboarding_tasks(order_by: {due_date: asc}) { id title assignee_role status due_date }
  }
}`

const empty = { full_name: '', email: '', phone: '', department: 'Phòng Kỹ thuật', job_title: '', manager_id: '', hire_date: new Date().toISOString().slice(0, 10),
  base_salary: '', allowance: '0', dependents: '0', contract_type: 'probation', create_account: true }

export default function Onboarding() {
  const { push } = useToast()
  const { data, loading, error, reload } = useQuery<any>(Q)
  const [form, setForm] = useState<any>(empty)
  const [sending, setSending] = useState(false)
  const [account, setAccount] = useState<any>(null)
  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }))

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSending(true)
    try {
      const r = await api<any>('/api/employees', 'POST', {
        ...form, manager_id: form.manager_id || null, phone: form.phone || null,
        base_salary: Number(form.base_salary), allowance: Number(form.allowance), dependents: Number(form.dependents),
      })
      setAccount(r.account ? { code: r.employee_code, ...r.account } : { code: r.employee_code })
      push({ title: 'Đã tạo hồ sơ nhân viên mới', message: `Mã ${r.employee_code} - quy trình onboarding đang chạy trên n8n`, kind: 'success' })
      setForm(empty); reload()
    } catch (x) { push({ title: 'Không tạo được nhân viên', message: errMsg(x), kind: 'error' }) }
    finally { setSending(false) }
  }
  const complete = async (id: string) => {
    try { await api(`/api/onboarding-tasks/${id}/complete`, 'POST'); reload() }
    catch (x) { push({ title: 'Không thực hiện được', message: errMsg(x), kind: 'error' }) }
  }

  if (loading) return <Loading />
  if (error) return <ErrorBox message={error} />
  return (
    <div>
      <PageHeader title="Onboarding nhân viên mới" description="Tạo hồ sơ + hợp đồng + tài khoản SSO; workflow n8n sinh checklist và gửi thông báo." />
      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Thêm nhân viên</CardTitle></CardHeader>
          <CardContent>
            <form onSubmit={submit} className="space-y-3">
              <Field label="Họ và tên"><Input value={form.full_name} onChange={(e) => set('full_name', e.target.value)} required /></Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Email"><Input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} required /></Field>
                <Field label="Điện thoại"><Input value={form.phone} onChange={(e) => set('phone', e.target.value)} /></Field>
                <Field label="Phòng ban"><Input value={form.department} onChange={(e) => set('department', e.target.value)} required /></Field>
                <Field label="Chức danh"><Input value={form.job_title} onChange={(e) => set('job_title', e.target.value)} required /></Field>
              </div>
              <Field label="Quản lý trực tiếp">
                <Select value={form.manager_id} onChange={(e) => set('manager_id', e.target.value)}>
                  <option value="">— Chưa chọn —</option>
                  {data.managers.map((m: any) => <option key={m.id} value={m.id}>{m.full_name} · {m.job_title}</option>)}
                </Select>
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Ngày bắt đầu"><Input type="date" value={form.hire_date} onChange={(e) => set('hire_date', e.target.value)} required /></Field>
                <Field label="Loại hợp đồng">
                  <Select value={form.contract_type} onChange={(e) => set('contract_type', e.target.value)}>
                    {Object.entries(CONTRACT_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </Select>
                </Field>
                <Field label="Lương cơ bản (đ)"><Input type="number" min={1} value={form.base_salary} onChange={(e) => set('base_salary', e.target.value)} required /></Field>
                <Field label="Phụ cấp (đ)"><Input type="number" min={0} value={form.allowance} onChange={(e) => set('allowance', e.target.value)} /></Field>
              </div>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.create_account} onChange={(e) => set('create_account', e.target.checked)} /> Tạo tài khoản SSO (Keycloak)</label>
              <Button type="submit" className="w-full" disabled={sending}>{sending ? 'Đang tạo…' : 'Tạo hồ sơ & bắt đầu onboarding'}</Button>
            </form>
            {account && (
              <div className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm">
                <p className="font-medium text-emerald-800">Đã tạo {account.code}</p>
                {account.username && <p className="mt-1">Tài khoản: <b>{account.username}</b> · Mật khẩu tạm: <b>{account.temporary_password}</b>
                  <button className="ml-2 align-middle text-emerald-700" onClick={() => navigator.clipboard.writeText(account.temporary_password)}><Copy className="inline h-3.5 w-3.5" /></button></p>}
                {account.error && <p className="mt-1 text-amber-700">{account.error}</p>}
                <p className="mt-1 text-xs text-muted-foreground">Hãy gửi thông tin này cho nhân viên - họ sẽ phải đổi mật khẩu ở lần đăng nhập đầu.</p>
              </div>
            )}
          </CardContent>
        </Card>
        <div className="space-y-4 lg:col-span-3">
          {data.onboarding.length === 0 && <Card><CardContent className="pt-5"><Empty text="Không có nhân viên nào đang onboarding" /></CardContent></Card>}
          {data.onboarding.map((e: any) => {
            const done = e.onboarding_tasks.filter((t: any) => t.status === 'done').length
            return (
              <Card key={e.id}>
                <CardHeader className="flex-row items-start justify-between space-y-0">
                  <div><CardTitle>{e.full_name}</CardTitle><p className="text-sm text-muted-foreground">{e.employee_code} · {e.job_title} · bắt đầu {fmtDate(e.hire_date)}</p></div>
                  <Badge variant={done === e.onboarding_tasks.length && done > 0 ? 'success' : 'warning'}>{done}/{e.onboarding_tasks.length} việc</Badge>
                </CardHeader>
                <CardContent className="space-y-2">
                  {e.onboarding_tasks.length === 0 && <p className="text-sm text-muted-foreground">Checklist đang được workflow n8n tạo…</p>}
                  {e.onboarding_tasks.map((t: any) => (
                    <div key={t.id} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
                      <div><p className={t.status === 'done' ? 'text-muted-foreground line-through' : 'font-medium'}>{t.title}</p>
                        <p className="text-xs text-muted-foreground">{ASSIGNEE_LABEL[t.assignee_role]} · hạn {fmtDate(t.due_date)}</p></div>
                      {t.status === 'done' ? <Badge variant="success">Đã xong</Badge> : <Button size="sm" variant="outline" onClick={() => complete(t.id)}>Hoàn thành</Button>}
                    </div>
                  ))}
                </CardContent>
              </Card>
            )
          })}
        </div>
      </div>
    </div>
  )
}
