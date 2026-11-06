// SPDX-License-Identifier: Apache-2.0
import {
  Award,
  BadgeCheck,
  Briefcase,
  Building2,
  Calendar,
  CalendarDays,
  CheckCircle2,
  CheckSquare,
  Clock,
  CreditCard,
  FileText,
  Mail,
  MapPin,
  Phone,
  ShieldCheck,
  User,
  Users,
} from 'lucide-react'
import type { ReactNode } from 'react'
import { useAuth } from '@/auth/AuthProvider'
import { Empty, ErrorBox, errMsg, Loading } from '@/components/common'
import { useToast } from '@/hooks/toast'
import { useMe } from '@/hooks/useMe'
import { useQuery } from '@/hooks/useQuery'
import { api } from '@/lib/api'
import { ASSIGNEE_LABEL, EMP_STATUS, fmtDate, ROLE_LABEL } from '@/lib/format'
import { cn } from '@/lib/utils'

const Q = `query Profile($uid: uuid!) {
  employees(where: {user_id: {_eq: $uid}}, limit: 1) {
    id employee_code full_name email phone date_of_birth gender address department job_title hire_date status
    tax_code social_insurance_no health_insurance_no dependents
    onboarding_tasks(order_by: {due_date: asc}) { id title assignee_role status due_date }
  }
}`

function ProfileField({
  icon: Icon,
  label,
  value,
  mono = false,
}: {
  icon?: any
  label: string
  value: ReactNode
  mono?: boolean
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 py-3 text-sm items-center">
      <div className="flex items-center gap-2.5 text-slate-500">
        {Icon && <Icon className="h-4 w-4 text-slate-400 shrink-0" />}
        <span className="font-medium text-slate-500">{label}</span>
      </div>
      <div className={cn('sm:col-span-2 font-semibold text-slate-900', mono && 'font-mono font-medium')}>
        {value ?? '—'}
      </div>
    </div>
  )
}

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
    try {
      await api(`/api/onboarding-tasks/${id}/complete`, 'POST')
      push({ title: 'Đã hoàn thành công việc', kind: 'success' })
      reload()
    } catch (x) {
      push({ title: 'Không thực hiện được', message: errMsg(x), kind: 'error' })
    }
  }

  const initial = (e.full_name?.trim() ? e.full_name.trim().charAt(0) : 'U').toUpperCase()

  return (
    <div className="-mt-4 space-y-6">
      {/* Title Header */}
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">Hồ sơ cá nhân</h1>
        <p className="mt-1 text-base font-medium text-slate-500">
          Thông tin chi tiết của bạn trong hệ thống PeopleOS
        </p>
      </div>

      {/* Hero Profile Summary Card */}
      <div className="rounded-2xl border border-slate-100/90 bg-white p-6 shadow-[0_2px_12px_rgba(0,0,0,0.03)]">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-5">
          <div className="flex items-center gap-5">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-blue-700 text-2xl font-bold text-white shadow-md shadow-blue-500/20">
              {initial}
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2.5">
                <h2 className="text-xl font-bold text-slate-900">{e.full_name}</h2>
                {e.employee_code && (
                  <span className="rounded-full bg-blue-50 px-2.5 py-0.5 font-mono text-xs font-semibold text-[#1D4ED8] border border-blue-100">
                    {e.employee_code}
                  </span>
                )}
                <span
                  className={cn(
                    'rounded-full px-2.5 py-0.5 text-xs font-semibold',
                    e.status === 'active'
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      : 'bg-amber-50 text-amber-700 border border-amber-200'
                  )}
                >
                  {EMP_STATUS[e.status] ?? e.status}
                </span>
              </div>
              <p className="mt-1 text-sm font-medium text-slate-500">
                {e.job_title} · {e.department}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
            {e.email && (
              <div className="flex items-center gap-1.5 rounded-xl bg-slate-50 px-3 py-2 border border-slate-100">
                <Mail className="h-4 w-4 text-slate-400" />
                <span>{e.email}</span>
              </div>
            )}
            {e.phone && (
              <div className="flex items-center gap-1.5 rounded-xl bg-slate-50 px-3 py-2 border border-slate-100">
                <Phone className="h-4 w-4 text-slate-400" />
                <span>{e.phone}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Main Details Grid */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Card 1: Thông tin chung */}
        <div className="rounded-2xl border border-slate-100/90 bg-white p-6 shadow-[0_2px_12px_rgba(0,0,0,0.03)]">
          <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#EFF6FF] text-[#2563EB]">
              <User className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">Thông tin chung</h3>
              <p className="text-xs font-medium text-slate-400">Thông tin cá nhân và liên hệ</p>
            </div>
          </div>

          <div className="mt-4 divide-y divide-slate-100">
            <ProfileField icon={User} label="Họ và tên" value={e.full_name} />
            <ProfileField icon={BadgeCheck} label="Mã nhân viên" value={e.employee_code} mono />
            <ProfileField icon={Mail} label="Email" value={e.email} />
            <ProfileField icon={Phone} label="Điện thoại" value={e.phone} />
            <ProfileField icon={Calendar} label="Ngày sinh" value={fmtDate(e.date_of_birth)} />
            <ProfileField icon={Users} label="Giới tính" value={e.gender} />
            <ProfileField icon={MapPin} label="Địa chỉ" value={e.address} />
          </div>
        </div>

        {/* Card 2: Công việc & an sinh */}
        <div className="rounded-2xl border border-slate-100/90 bg-white p-6 shadow-[0_2px_12px_rgba(0,0,0,0.03)]">
          <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#FAF5FF] text-[#9333EA]">
              <Briefcase className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">Công việc & an sinh</h3>
              <p className="text-xs font-medium text-slate-400">Chức danh, phòng ban và bảo hiểm</p>
            </div>
          </div>

          <div className="mt-4 divide-y divide-slate-100">
            <ProfileField icon={Award} label="Chức danh" value={e.job_title} />
            <ProfileField icon={Building2} label="Phòng ban" value={e.department} />
            <ProfileField icon={User} label="Quản lý trực tiếp" value={meInfo?.employee?.manager?.full_name} />
            <ProfileField icon={CalendarDays} label="Ngày vào làm" value={fmtDate(e.hire_date)} />
            <ProfileField
              icon={ShieldCheck}
              label="Trạng thái"
              value={
                <span
                  className={cn(
                    'rounded-full px-2.5 py-0.5 text-xs font-semibold',
                    e.status === 'active'
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      : 'bg-amber-50 text-amber-700 border border-amber-200'
                  )}
                >
                  {EMP_STATUS[e.status] ?? e.status}
                </span>
              }
            />
            <ProfileField icon={ShieldCheck} label="Vai trò hệ thống" value={ROLE_LABEL[user.role] ?? user.role} />
            <ProfileField icon={FileText} label="Mã số thuế" value={e.tax_code} mono />
            <ProfileField icon={CreditCard} label="Số sổ BHXH" value={e.social_insurance_no} mono />
            <ProfileField icon={CreditCard} label="Số thẻ BHYT" value={e.health_insurance_no} mono />
            <ProfileField
              icon={Users}
              label="Người phụ thuộc"
              value={e.dependents != null ? `${e.dependents} người` : '0 người'}
            />
          </div>
        </div>
      </div>

      {/* Onboarding Checklist (chỉ hiển thị khi đang onboarding) */}
      {e.status === 'onboarding' && (
        <div className="rounded-2xl border border-slate-100/90 bg-white p-6 shadow-[0_2px_12px_rgba(0,0,0,0.03)]">
          <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-amber-50 text-amber-600">
              <CheckSquare className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">Checklist hội nhập</h3>
              <p className="text-xs font-medium text-slate-400">Nhiệm vụ cần hoàn thành cho nhân viên mới</p>
            </div>
          </div>
          <div className="mt-4 space-y-3">
            {e.onboarding_tasks.map((t: any) => (
              <div
                key={t.id}
                className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50/60 p-4 text-sm transition-all hover:bg-slate-50"
              >
                <div className="space-y-1">
                  <p className="font-semibold text-slate-800">{t.title}</p>
                  <p className="text-xs font-medium text-slate-500">
                    {ASSIGNEE_LABEL[t.assignee_role] ?? t.assignee_role} · Hạn {fmtDate(t.due_date)}
                  </p>
                </div>
                {t.status === 'done' ? (
                  <span className="flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 border border-emerald-200">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Đã xong
                  </span>
                ) : mine.some((m: any) => m.id === t.id) ? (
                  <button
                    onClick={() => complete(t.id)}
                    className="flex items-center gap-1.5 rounded-xl bg-[#2563EB] px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-blue-700 transition-colors"
                  >
                    Hoàn thành
                  </button>
                ) : (
                  <span className="flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700 border border-amber-200">
                    <Clock className="h-3.5 w-3.5" /> Đang chờ
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
