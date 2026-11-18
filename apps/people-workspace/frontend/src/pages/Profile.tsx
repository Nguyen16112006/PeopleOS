// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 PeopleOS contributors
import type { ReactNode } from 'react'
import { useAuth } from '@/auth/AuthProvider'
import { DocSheet, Empty, ErrorBox, errMsg, InfoRow, Loading, PageHeader, StatusBadge } from '@/components/common'
import { Seal } from '@/components/Stamp'
import { useToast } from '@/hooks/toast'
import { useMe } from '@/hooks/useMe'
import { useQuery } from '@/hooks/useQuery'
import { api } from '@/lib/api'
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
  if (error) return <ErrorBox message={error} onRetry={reload} />

  const e = data.employees[0]
  if (!e) return <Empty text={user.role === 'hr' ? 'Tài khoản này chưa được liên kết với hồ sơ nhân sự.' : 'Tài khoản của bạn chưa được liên kết với hồ sơ nhân sự. Hãy nhắn HR để được liên kết.'} />
  const mine = e.onboarding_tasks.filter((t: any) => t.assignee_role === 'employee')

  const complete = async (id: string) => {
    try {
      await api(`/api/onboarding-tasks/${id}/complete`, 'POST')
      push({ title: 'Đã hoàn thành công việc', kind: 'success' })
      reload()
    } catch (x) {
      push({ title: 'Không thực hiện được', message: errMsg(x), kind: 'error' })
    }
  }
  const v = (x: ReactNode) => x || <span className="text-muted-foreground">Chưa cập nhật</span>

  return (
    <div>
      <PageHeader title="Hồ sơ cá nhân" description="Thông tin HR đang lưu về bạn. Thấy chỗ nào chưa đúng, hãy nhắn HR để cập nhật; mã số thuế và người phụ thuộc ảnh hưởng trực tiếp tới thuế TNCN." />

      {e.status === 'onboarding' && (
        <section className="po-panel mb-5" aria-labelledby="onb-title">
          <div className="po-panel-head"><h2 id="onb-title">Việc cần làm khi mới vào</h2><span className="text-[14px] text-muted-foreground">{e.onboarding_tasks.filter((t: any) => t.status === 'done').length}/{e.onboarding_tasks.length} đã xong</span></div>
          <ul className="po-list">
            {e.onboarding_tasks.map((t: any) => (
              <li key={t.id}>
                <div className="po-list-main"><strong>{t.title}</strong><span>{ASSIGNEE_LABEL[t.assignee_role] ?? t.assignee_role} · hạn {fmtDate(t.due_date)}</span></div>
                <div className="po-list-side">
                  {t.status === 'done' ? <Seal label="Đã xong" />
                    : mine.some((m: any) => m.id === t.id) ? <button type="button" className="po-btn po-btn-primary" onClick={() => complete(t.id)}>Đánh dấu đã xong</button>
                    : <StatusBadge status="pending" map={{ pending: 'Đang chờ người khác' }} />}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <DocSheet title={e.full_name} meta={<>{e.employee_code ? `Mã NV ${e.employee_code} · ` : ''}<StatusBadge status={e.status} map={EMP_STATUS} /></>}>
        <div className="po-doc-cols">
          <dl className="po-doc-rows">
            <InfoRow label="Chức danh" value={v(e.job_title)} />
            <InfoRow label="Phòng ban" value={v(e.department)} />
            <InfoRow label="Quản lý trực tiếp" value={v(meInfo?.employee?.manager?.full_name)} />
            <InfoRow label="Ngày vào làm" value={fmtDate(e.hire_date)} />
            <InfoRow label="Vai trò trên PeopleOS" value={ROLE_LABEL[user.role] ?? user.role} />
          </dl>
          <dl className="po-doc-rows">
            <InfoRow label="Email" value={v(e.email)} />
            <InfoRow label="Điện thoại" value={v(e.phone)} />
            <InfoRow label="Ngày sinh" value={e.date_of_birth ? fmtDate(e.date_of_birth) : v(null)} />
            <InfoRow label="Giới tính" value={v(e.gender)} />
            <InfoRow label="Địa chỉ" value={v(e.address)} />
          </dl>
        </div>
      </DocSheet>

      <DocSheet title="Thuế và bảo hiểm">
        <dl className="po-doc-rows max-w-[640px]">
          <InfoRow label="Mã số thuế cá nhân" value={v(e.tax_code)} />
          <InfoRow label="Người phụ thuộc" value={`${e.dependents ?? 0} người`} />
          <InfoRow label="Số sổ BHXH" value={v(e.social_insurance_no)} />
          <InfoRow label="Số thẻ BHYT" value={v(e.health_insurance_no)} />
        </dl>
      </DocSheet>
    </div>
  )
}
