import { CalendarDays, CheckSquare, Wallet } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/auth/AuthProvider'
import { Empty, ErrorBox, Loading, PageHeader } from '@/components/common'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
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

function Stat({ icon: Icon, title, value, hint, to }: { icon: any; title: string; value: string; hint?: string; to: string }) {
  return (
    <Link to={to}>
      <Card className="transition-shadow hover:shadow-md">
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardDescription>{title}</CardDescription><Icon className="h-4 w-4 text-primary" />
        </CardHeader>
        <CardContent><p className="text-2xl font-semibold">{value}</p>{hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}</CardContent>
      </Card>
    </Link>
  )
}

function ApproverStats() {
  const { user } = useAuth()
  const steps = user.role === 'admin' ? ['pending_hr', 'pending_admin'] : user.role === 'hr' ? ['pending_hr'] : ['__none__']
  const { data } = useQuery<{ leave: { aggregate: { count: number } }; proposals: { aggregate: { count: number } } }>(QA, { uid: user.sub, steps })
  if (!data) return null
  return (
    <>
      <Stat icon={CheckSquare} title="Đơn nghỉ chờ bạn duyệt" value={String(data.leave.aggregate.count)} to="/approvals" />
      {user.role !== 'manager' && <Stat icon={CheckSquare} title="Đề xuất lương chờ duyệt" value={String(data.proposals.aggregate.count)} to="/approvals" />}
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
    <div>
      <PageHeader title={`Xin chào, ${user.name}`} description={me ? `${me.job_title} · ${me.department}` : 'Tài khoản chưa liên kết hồ sơ nhân sự'} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat icon={CalendarDays} title="Ngày phép còn lại" to="/leave"
          value={bal ? `${Number(bal.entitled_days) - Number(bal.used_days)} / ${Number(bal.entitled_days)}` : '—'}
          hint={data.leave_requests.length ? `${data.leave_requests.length} đơn đang chờ duyệt` : 'Không có đơn chờ duyệt'} />
        <Stat icon={Wallet} title={pay ? `Lương ${monthLabel(pay.period_year, pay.period_month)}` : 'Lương gần nhất'} to="/payslips"
          value={pay ? vnd(pay.net_salary) : '—'} hint={pay ? `Gross ${vnd(pay.gross)}` : undefined} />
        {user.role !== 'employee' && <ApproverStats />}
      </div>
      {me && (
        <Card className="mt-6">
          <CardHeader><CardTitle>Thông tin công việc</CardTitle></CardHeader>
          <CardContent className="grid gap-2 text-sm sm:grid-cols-3">
            <div><p className="text-muted-foreground">Ngày vào làm</p><p className="font-medium">{fmtDate(me.hire_date)}</p></div>
            <div><p className="text-muted-foreground">Quản lý trực tiếp</p><p className="font-medium">{meInfo?.employee?.manager?.full_name ?? '—'}</p></div>
            <div><p className="text-muted-foreground">Phòng ban</p><p className="font-medium">{me.department}</p></div>
          </CardContent>
        </Card>
      )}
      {!me && <Empty text="Chưa có hồ sơ nhân sự" />}
    </div>
  )
}
