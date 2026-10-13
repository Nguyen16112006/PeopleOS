import {
  Briefcase,
  Building2,
  Calendar,
  CalendarDays,
  CheckSquare,
  ChevronRight,
  Info,
  User,
  Wallet,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/auth/AuthProvider'
import { Empty, ErrorBox, Loading } from '@/components/common'
import { useMe } from '@/hooks/useMe'
import { useQuery } from '@/hooks/useQuery'
import { fmtDate, monthLabel, vnd } from '@/lib/format'

const Q = `query Dash($uid: uuid!, $year: smallint!) {
  employees(where: {user_id: {_eq: $uid}}, limit: 1) { full_name job_title department hire_date }
  leave_balances(where: {employee: {user_id: {_eq: $uid}}, year: {_eq: $year}}) { entitled_days used_days }
  payrolls(where: {employee: {user_id: {_eq: $uid}}}, order_by: [{period_year: desc}, {period_month: desc}], limit: 1) { period_month period_year gross net_salary }
  leave_requests(where: {employee: {user_id: {_eq: $uid}}, status: {_eq: "pending"}}) { id }
}`

const QA = `query Approver($uid: uuid!, $steps: [String!]!) {
  leave: leave_requests_aggregate(where: {status: {_eq: "pending"}, employee: {user_id: {_neq: $uid}}}) { aggregate { count } }
  proposals: salary_proposals_aggregate(where: {status: {_in: $steps}}) { aggregate { count } }
}`

function WelcomeIllustration() {
  return (
    <div className="relative hidden sm:block w-72 h-36 shrink-0 pointer-events-none select-none">
      <svg viewBox="0 0 280 140" fill="none" className="w-full h-full">
        {/* Soft background glow blobs */}
        <ellipse cx="210" cy="85" rx="70" ry="55" fill="#E0F2FE" opacity="0.6" />
        <ellipse cx="230" cy="70" rx="45" ry="40" fill="#BAE6FD" opacity="0.4" />

        {/* Desk Calendar Base / Sheet */}
        <g transform="translate(145, 18)">
          <rect x="3" y="10" width="76" height="74" rx="10" fill="#CBD5E1" opacity="0.3" />
          <rect x="0" y="8" width="76" height="72" rx="10" fill="#FFFFFF" stroke="#E2E8F0" strokeWidth="1.5" />
          
          {/* Top binder rings */}
          <rect x="14" y="2" width="6" height="12" rx="3" fill="#60A5FA" />
          <rect x="35" y="2" width="6" height="12" rx="3" fill="#60A5FA" />
          <rect x="56" y="2" width="6" height="12" rx="3" fill="#60A5FA" />

          {/* Calendar Grid representation */}
          <circle cx="16" cy="28" r="2.5" fill="#E2E8F0" />
          <circle cx="28" cy="28" r="2.5" fill="#E2E8F0" />
          <circle cx="40" cy="28" r="2.5" fill="#E2E8F0" />
          <circle cx="52" cy="28" r="2.5" fill="#E2E8F0" />
          <circle cx="64" cy="28" r="2.5" fill="#E2E8F0" />

          <circle cx="16" cy="40" r="2.5" fill="#E2E8F0" />
          <circle cx="28" cy="40" r="2.5" fill="#E2E8F0" />
          <circle cx="40" cy="40" r="2.5" fill="#E2E8F0" />
          <circle cx="52" cy="40" r="2.5" fill="#E2E8F0" />

          <circle cx="16" cy="52" r="2.5" fill="#E2E8F0" />
          <circle cx="28" cy="52" r="2.5" fill="#E2E8F0" />
          <circle cx="40" cy="52" r="2.5" fill="#E2E8F0" />

          <circle cx="16" cy="64" r="2.5" fill="#E2E8F0" />
          <circle cx="28" cy="64" r="2.5" fill="#E2E8F0" />

          {/* Checkmark Blue Badge */}
          <circle cx="58" cy="54" r="13" fill="#2563EB" />
          <path d="M53 54L57 58L64 50" stroke="#FFFFFF" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        </g>

        {/* Potted Plant */}
        <g transform="translate(225, 45)">
          <path d="M12 28C8 16 0 10 -4 4C6 8 10 16 12 28Z" fill="#10B981" />
          <path d="M14 28C14 14 22 6 30 2C24 10 20 18 14 28Z" fill="#34D399" />
          <path d="M13 28C11 12 14 4 18 -4C18 6 17 16 13 28Z" fill="#059669" />

          <path d="M5 28H21L19 44H7L5 28Z" fill="#93C5FD" stroke="#60A5FA" strokeWidth="1" />
          <rect x="4" y="26" width="18" height="4" rx="2" fill="#60A5FA" />
        </g>
      </svg>
    </div>
  )
}

function ApproverStats() {
  const { user } = useAuth()
  const steps = user.role === 'admin' ? ['pending_hr', 'pending_admin'] : user.role === 'hr' ? ['pending_hr'] : ['__none__']
  const { data } = useQuery<{ leave: { aggregate: { count: number } }; proposals: { aggregate: { count: number } } }>(QA, { uid: user.sub, steps })
  if (!data) return null

  return (
    <>
      <Link
        to="/approvals"
        className="group flex items-center justify-between rounded-2xl border border-slate-100/90 bg-white p-6 shadow-[0_2px_12px_rgba(0,0,0,0.03)] transition-all hover:shadow-[0_8px_25px_rgba(0,0,0,0.06)]"
      >
        <div className="flex items-center gap-5">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-amber-50 text-amber-600">
            <CheckSquare className="h-7 w-7" />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-600">Đơn nghỉ chờ bạn duyệt</p>
            <p className="mt-1 text-3xl font-bold tracking-tight text-slate-900">{data.leave.aggregate.count}</p>
          </div>
        </div>
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-50 text-amber-600 group-hover:bg-amber-100 transition-colors">
          <ChevronRight className="h-5 w-5" />
        </div>
      </Link>

      {user.role !== 'manager' && (
        <Link
          to="/approvals"
          className="group flex items-center justify-between rounded-2xl border border-slate-100/90 bg-white p-6 shadow-[0_2px_12px_rgba(0,0,0,0.03)] transition-all hover:shadow-[0_8px_25px_rgba(0,0,0,0.06)]"
        >
          <div className="flex items-center gap-5">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600">
              <CheckSquare className="h-7 w-7" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-600">Đề xuất lương chờ duyệt</p>
              <p className="mt-1 text-3xl font-bold tracking-tight text-slate-900">{data.proposals.aggregate.count}</p>
            </div>
          </div>
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-indigo-50 text-indigo-600 group-hover:bg-indigo-100 transition-colors">
            <ChevronRight className="h-5 w-5" />
          </div>
        </Link>
      )}
    </>
  )
}

export default function Dashboard() {
  const { user } = useAuth()
  const { data, loading, error } = useQuery<any>(Q, { uid: user.sub, year: new Date().getFullYear() })
  const meInfo = useMe()

  if (loading) return <Loading />
  if (error) return <ErrorBox message={error} />

  const me = data.employees[0]
  const bal = data.leave_balances[0]
  const pay = data.payrolls[0]

  return (
    <div className="space-y-6">
      {/* Welcome Banner */}
      <div className="flex items-start justify-between -mt-4 pb-0">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">
            Xin chào, {user.name} 👋
          </h1>
          <p className="mt-1 text-base font-medium text-slate-500">
            {me ? `${me.job_title} · ${me.department}` : 'Tài khoản chưa liên kết hồ sơ nhân sự'}
          </p>
        </div>
        <WelcomeIllustration />
      </div>

      {/* Main Stats Grid */}
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-2">
        {/* Card 1: Ngày phép còn lại */}
        <Link
          to="/leave"
          className="group flex items-center justify-between rounded-2xl border border-slate-100/90 bg-white p-6 shadow-[0_2px_12px_rgba(0,0,0,0.03)] transition-all hover:shadow-[0_8px_25px_rgba(0,0,0,0.06)]"
        >
          <div className="flex items-center gap-5">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[#EFF6FF] text-[#2563EB]">
              <Calendar className="h-7 w-7" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-semibold text-[#1D4ED8]">Ngày phép còn lại</span>
                <Info className="h-4 w-4 text-slate-400 cursor-pointer" />
              </div>
              <p className="mt-1 text-3xl font-bold tracking-tight text-slate-900">
                {bal ? `${Number(bal.entitled_days) - Number(bal.used_days)} / ${Number(bal.entitled_days)}` : '—'}
              </p>
              <p className="mt-1 text-xs font-medium text-slate-500">
                {data.leave_requests?.length ? `${data.leave_requests.length} đơn đang chờ duyệt` : 'Không có đơn chờ duyệt'}
              </p>
            </div>
          </div>
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#EFF6FF] text-[#2563EB] group-hover:bg-blue-100 transition-colors">
            <ChevronRight className="h-5 w-5" />
          </div>
        </Link>

        {/* Card 2: Lương */}
        <Link
          to="/payslips"
          className="group flex items-center justify-between rounded-2xl border border-[#DCFCE7] bg-[#F2FBF7] p-6 shadow-[0_2px_12px_rgba(0,0,0,0.02)] transition-all hover:shadow-[0_8px_25px_rgba(0,0,0,0.05)]"
        >
          <div className="flex items-center gap-5">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[#DCFCE7] text-[#16A34A]">
              <Wallet className="h-7 w-7" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-600">
                {pay ? `Lương ${monthLabel(pay.period_year, pay.period_month)}` : 'Lương gần nhất'}
              </p>
              <p className="mt-1 text-3xl font-bold tracking-tight text-slate-900">
                {pay ? vnd(pay.net_salary) : '—'}
              </p>
              <p className="mt-1 text-xs font-medium text-slate-500">
                {pay?.gross ? `Gross ${vnd(pay.gross)}` : (pay ? undefined : '—')}
              </p>
            </div>
          </div>
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#DCFCE7] text-[#16A34A] group-hover:bg-emerald-200 transition-colors">
            <ChevronRight className="h-5 w-5" />
          </div>
        </Link>

        {/* Approver Stats if applicable */}
        {user.role !== 'employee' && <ApproverStats />}
      </div>

      {/* Thông tin công việc Card (chỉ hiện khi có hồ sơ nhân sự thật) */}
      {me && (
        <div className="rounded-2xl border border-slate-100/90 bg-white p-6 shadow-[0_2px_12px_rgba(0,0,0,0.03)]">
          <div className="flex items-center gap-2">
            <User className="h-5 w-5 fill-[#2563EB] text-[#2563EB]" />
            <h2 className="text-base font-bold text-slate-900">Thông tin công việc</h2>
          </div>

          <div className="mt-6 grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-slate-100">
            {/* Column 1: Ngày vào làm */}
            <div className="flex items-center gap-4 py-3 md:py-1 md:pr-6">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#EFF6FF] text-[#2563EB]">
                <CalendarDays className="h-6 w-6" />
              </div>
              <div>
                <p className="text-xs font-medium text-slate-400">Ngày vào làm</p>
                <p className="mt-0.5 text-base font-bold text-slate-900">
                  {fmtDate(me.hire_date)}
                </p>
              </div>
            </div>

            {/* Column 2: Quản lý trực tiếp */}
            <div className="flex items-center gap-4 py-3 md:py-1 md:px-6">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#EFF6FF] text-[#2563EB]">
                <Briefcase className="h-6 w-6" />
              </div>
              <div>
                <p className="text-xs font-medium text-slate-400">Quản lý trực tiếp</p>
                <p className="mt-0.5 text-base font-bold text-slate-900">
                  {meInfo?.employee?.manager?.full_name ?? '—'}
                </p>
              </div>
            </div>

            {/* Column 3: Phòng ban */}
            <div className="flex items-center gap-4 py-3 md:py-1 md:pl-6">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#FAF5FF] text-[#9333EA]">
                <Building2 className="h-6 w-6" />
              </div>
              <div>
                <p className="text-xs font-medium text-slate-400">Phòng ban</p>
                <p className="mt-0.5 text-base font-bold text-slate-900">
                  {me.department}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {!me && <Empty text="Chưa có hồ sơ nhân sự" />}
    </div>
  )
}
