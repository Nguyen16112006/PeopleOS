import { AlertTriangle, Banknote, CalendarClock, ClipboardCheck, UserPlus, Users, Wallet } from 'lucide-react'
import type { ReactNode } from 'react'
import { BarList, GroupedColumns } from '@/components/charts'
import { ErrorBox, Loading, PageHeader } from '@/components/common'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { useQuery } from '@/hooks/useQuery'
import { fmtDate, LEAVE_TYPES, monthLabel, vnd } from '@/lib/format'

const Q = `query Executive {
  v_kpi_summary { headcount onboarding_count active_contracts avg_base_salary pending_leave pending_proposals expiring_contracts latest_year latest_month latest_gross latest_net latest_employer_cost }
  v_headcount_by_department(order_by: {headcount: desc}) { department headcount avg_base_salary total_base_salary }
  v_payroll_monthly(order_by: [{period_year: asc}, {period_month: asc}]) { period_year period_month employees gross_total net_total pit_total employee_insurance_total employer_insurance_total employer_cost }
  v_leave_summary { leave_type status requests days }
  v_contracts_expiring(order_by: {days_left: asc}) { id contract_no full_name department end_date days_left }
}`

const short = (n: number) => (n >= 1e9 ? `${(n / 1e9).toFixed(2)} tỷ` : `${(n / 1e6).toFixed(1)} tr`)

function Kpi({ icon, title, value, hint, warn }: { icon: ReactNode; title: string; value: string; hint?: string; warn?: boolean }) {
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-1">
        <CardDescription>{title}</CardDescription><span className={warn ? 'text-amber-500' : 'text-primary'}>{icon}</span>
      </CardHeader>
      <CardContent><p className="text-2xl font-semibold">{value}</p>{hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}</CardContent>
    </Card>
  )
}

export default function Executive() {
  const { data, loading, error } = useQuery<any>(Q)
  if (loading) return <Loading />
  if (error) return <ErrorBox message={error} />
  const k = data.v_kpi_summary[0]
  const months: any[] = data.v_payroll_monthly
  const last = months[months.length - 1]
  const leaveByType = Object.entries(
    (data.v_leave_summary as any[]).filter((r) => r.status === 'approved').reduce((acc: Record<string, number>, r) => {
      acc[r.leave_type] = (acc[r.leave_type] ?? 0) + Number(r.days); return acc }, {}),
  ).map(([t, v]) => ({ label: LEAVE_TYPES[t] ?? t, value: v as number }))

  return (
    <div>
      <PageHeader title="Dashboard điều hành" description="Tổng hợp nhân sự, chi phí lương và rủi ro - dữ liệu lấy từ các view của Hasura (HR/Admin)" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi icon={<Users className="h-4 w-4" />} title="Nhân sự đang làm việc" value={String(k.headcount)} hint={`${k.active_contracts} hợp đồng hiệu lực`} />
        <Kpi icon={<UserPlus className="h-4 w-4" />} title="Đang onboarding" value={String(k.onboarding_count)} />
        <Kpi icon={<Banknote className="h-4 w-4" />} title="Lương cơ bản trung bình" value={vnd(k.avg_base_salary)} />
        <Kpi icon={<ClipboardCheck className="h-4 w-4" />} title="Việc chờ duyệt" value={String(k.pending_leave + k.pending_proposals)}
          hint={`${k.pending_leave} đơn nghỉ · ${k.pending_proposals} đề xuất lương`} warn={k.pending_leave + k.pending_proposals > 0} />
        {last && <>
          <Kpi icon={<Wallet className="h-4 w-4" />} title={`Tổng Gross ${monthLabel(k.latest_year, k.latest_month)}`} value={short(Number(k.latest_gross))} hint={vnd(k.latest_gross)} />
          <Kpi icon={<Wallet className="h-4 w-4" />} title="Tổng thực nhận (Net)" value={short(Number(k.latest_net))} hint={vnd(k.latest_net)} />
          <Kpi icon={<Banknote className="h-4 w-4" />} title="Chi phí DN (Gross + BH)" value={short(Number(k.latest_employer_cost))} hint={`Thuế TNCN ${vnd(last.pit_total)}`} />
        </>}
        <Kpi icon={<AlertTriangle className="h-4 w-4" />} title="Hợp đồng hết hạn ≤ 60 ngày" value={String(k.expiring_contracts)} warn={k.expiring_contracts > 0} />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Chi phí lương theo tháng</CardTitle><CardDescription>Gross, thực nhận và chi phí doanh nghiệp (triệu đồng)</CardDescription></CardHeader>
          <CardContent>
            <GroupedColumns labels={months.map((m) => `T${m.period_month}`)} format={(n) => vnd(n)}
              series={[
                { name: 'Gross', color: 'bg-blue-500', values: months.map((m) => Number(m.gross_total)) },
                { name: 'Net', color: 'bg-emerald-500', values: months.map((m) => Number(m.net_total)) },
                { name: 'Chi phí DN', color: 'bg-amber-500', values: months.map((m) => Number(m.employer_cost)) },
              ]} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Nhân sự theo phòng ban</CardTitle></CardHeader>
          <CardContent>
            <BarList items={data.v_headcount_by_department.map((d: any) => ({ label: d.department, value: d.headcount, hint: `Lương cơ bản TB ${vnd(d.avg_base_salary)}` }))} format={(n) => `${n} người`} />
          </CardContent>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader><CardTitle>Nghỉ phép đã duyệt năm nay</CardTitle><CardDescription>Tổng số ngày theo loại</CardDescription></CardHeader>
          <CardContent>{leaveByType.length ? <BarList items={leaveByType} format={(n) => `${n} ngày`} color="bg-emerald-500" /> : <p className="text-sm text-muted-foreground">Chưa có dữ liệu</p>}</CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle className="flex items-center gap-2"><CalendarClock className="h-4 w-4" /> Hợp đồng sắp hết hạn (90 ngày)</CardTitle></CardHeader>
          <CardContent>
            {data.v_contracts_expiring.length === 0 ? <p className="text-sm text-muted-foreground">Không có hợp đồng nào sắp hết hạn</p> : (
              <Table>
                <THead><TR><TH>Hợp đồng</TH><TH>Nhân viên</TH><TH>Phòng ban</TH><TH>Hết hạn</TH><TH>Còn lại</TH></TR></THead>
                <TBody>
                  {data.v_contracts_expiring.map((c: any) => (
                    <TR key={c.id}><TD className="font-medium">{c.contract_no}</TD><TD>{c.full_name}</TD><TD>{c.department}</TD><TD>{fmtDate(c.end_date)}</TD>
                      <TD><Badge variant={c.days_left <= 30 ? 'destructive' : 'warning'}>{c.days_left} ngày</Badge></TD></TR>
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
