import { useAuth } from '@/auth/AuthProvider'
import { api } from '@/lib/api'
import { Empty, ErrorBox, errMsg, InfoRow, Loading, PageHeader } from '@/components/common'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useToast } from '@/hooks/toast'
import { useMe } from '@/hooks/useMe'
import { useQuery } from '@/hooks/useQuery'
import { ASSIGNEE_LABEL, EMP_STATUS, fmtDate, ROLE_LABEL } from '@/lib/format'

const Q = `query Profile($uid: uuid!) {
  employees(where: {user_id: {_eq: $uid}}, limit: 1) {
    id employee_code full_name email phone date_of_birth gender address department job_title hire_date status
    tax_code social_insurance_no health_insurance_no dependents
    onboarding_tasks(order_by: {due_date: asc}) { id title assignee_role status due_date }
  }
}`

export default function Profile() {
  const { user } = useAuth()
  const { push } = useToast()
  const { data, loading, error, reload } = useQuery<any>(Q, { uid: user.sub })
  const meInfo = useMe()
  if (loading) return <Loading />
  if (error) return <ErrorBox message={error} />
  const e = data.employees[0]
  if (!e) return <Empty text="Tài khoản của bạn chưa được liên kết với hồ sơ nhân sự" />
  const mine = e.onboarding_tasks.filter((t: any) => t.assignee_role === 'employee')

  const complete = async (id: string) => {
    try { await api(`/api/onboarding-tasks/${id}/complete`, 'POST'); push({ title: 'Đã hoàn thành công việc', kind: 'success' }); reload() }
    catch (x) { push({ title: 'Không thực hiện được', message: errMsg(x), kind: 'error' }) }
  }

  return (
    <div>
      <PageHeader title="Hồ sơ cá nhân" description="Thông tin của bạn trong hệ thống nhân sự" />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Thông tin chung</CardTitle></CardHeader>
          <CardContent><dl>
            <InfoRow label="Họ và tên" value={e.full_name} />
            <InfoRow label="Mã nhân viên" value={e.employee_code} />
            <InfoRow label="Email" value={e.email} />
            <InfoRow label="Điện thoại" value={e.phone} />
            <InfoRow label="Ngày sinh" value={fmtDate(e.date_of_birth)} />
            <InfoRow label="Giới tính" value={e.gender} />
            <InfoRow label="Địa chỉ" value={e.address} />
          </dl></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Công việc & an sinh</CardTitle></CardHeader>
          <CardContent><dl>
            <InfoRow label="Chức danh" value={e.job_title} />
            <InfoRow label="Phòng ban" value={e.department} />
            <InfoRow label="Quản lý trực tiếp" value={meInfo?.employee?.manager?.full_name} />
            <InfoRow label="Ngày vào làm" value={fmtDate(e.hire_date)} />
            <InfoRow label="Trạng thái" value={<Badge variant={e.status === 'active' ? 'success' : 'warning'}>{EMP_STATUS[e.status]}</Badge>} />
            <InfoRow label="Vai trò hệ thống" value={ROLE_LABEL[user.role]} />
            <InfoRow label="Mã số thuế" value={e.tax_code} />
            <InfoRow label="Số sổ BHXH" value={e.social_insurance_no} />
            <InfoRow label="Số thẻ BHYT" value={e.health_insurance_no} />
            <InfoRow label="Người phụ thuộc" value={e.dependents} />
          </dl></CardContent>
        </Card>
      </div>
      {e.status === 'onboarding' && (
        <Card className="mt-4">
          <CardHeader><CardTitle>Checklist hội nhập</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {e.onboarding_tasks.map((t: any) => (
              <div key={t.id} className="flex items-center justify-between rounded-md border p-3 text-sm">
                <div><p className="font-medium">{t.title}</p><p className="text-xs text-muted-foreground">{ASSIGNEE_LABEL[t.assignee_role]} · hạn {fmtDate(t.due_date)}</p></div>
                {t.status === 'done' ? <Badge variant="success">Đã xong</Badge>
                  : mine.some((m: any) => m.id === t.id) ? <Button size="sm" onClick={() => complete(t.id)}>Hoàn thành</Button> : <Badge variant="warning">Đang chờ</Badge>}
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
