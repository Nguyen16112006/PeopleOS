import { useAuth } from '@/auth/AuthProvider'
import { Empty, ErrorBox, Loading, PageHeader } from '@/components/common'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { useQuery } from '@/hooks/useQuery'
import { vnd } from '@/lib/format'

const Q = `query Insurance($uid: uuid!) {
  employees(where: {user_id: {_eq: $uid}}, limit: 1) { social_insurance_no health_insurance_no }
  insurance_records(where: {employee: {user_id: {_eq: $uid}}}, order_by: {period: desc}) {
    id period insured_salary bhxh_employee bhyt_employee bhtn_employee bhxh_employer bhyt_employer bhtn_employer
  }
}`

export default function Insurance() {
  const { user } = useAuth()
  const { data, loading, error } = useQuery<any>(Q, { uid: user.sub })
  if (loading) return <Loading />
  if (error) return <ErrorBox message={error} />
  const rows: any[] = data.insurance_records
  const emp = data.employees[0]
  const sum = (k: string) => rows.reduce((s, r) => s + Number(r[k]), 0)
  const employee = sum('bhxh_employee') + sum('bhyt_employee') + sum('bhtn_employee')
  const employer = sum('bhxh_employer') + sum('bhyt_employer') + sum('bhtn_employer')
  const ym = (d: string) => `${d.slice(5, 7)}/${d.slice(0, 4)}`

  return (
    <div>
      <PageHeader title="BHXH / BHYT" description="Quá trình đóng bảo hiểm do công ty kê khai hằng tháng (tham khảo - đối chiếu với VssID)" />
      <div className="grid gap-4 sm:grid-cols-4">
        <Card><CardHeader><CardDescription>Số sổ BHXH</CardDescription><CardTitle>{emp?.social_insurance_no ?? '—'}</CardTitle></CardHeader></Card>
        <Card><CardHeader><CardDescription>Số thẻ BHYT</CardDescription><CardTitle>{emp?.health_insurance_no ?? '—'}</CardTitle></CardHeader></Card>
        <Card><CardHeader><CardDescription>Số tháng đã đóng</CardDescription><CardTitle>{rows.length} tháng</CardTitle></CardHeader></Card>
        <Card><CardHeader><CardDescription>Bạn đã đóng / DN đóng</CardDescription><CardTitle className="text-sm">{vnd(employee)} / {vnd(employer)}</CardTitle></CardHeader></Card>
      </div>
      <Card className="mt-4">
        <CardHeader><CardTitle>Chi tiết theo tháng</CardTitle></CardHeader>
        <CardContent>
          {rows.length === 0 ? <Empty text="Chưa có dữ liệu đóng bảo hiểm" /> : (
            <Table>
              <THead><TR><TH>Tháng</TH><TH>Lương đóng BH</TH><TH>BHXH (NLĐ 8%)</TH><TH>BHYT (1,5%)</TH><TH>BHTN (1%)</TH><TH>DN đóng (21,5%)</TH></TR></THead>
              <TBody>
                {rows.map((r) => (
                  <TR key={r.id}>
                    <TD className="font-medium">{ym(r.period)}</TD><TD>{vnd(r.insured_salary)}</TD><TD>{vnd(r.bhxh_employee)}</TD>
                    <TD>{vnd(r.bhyt_employee)}</TD><TD>{vnd(r.bhtn_employee)}</TD>
                    <TD>{vnd(Number(r.bhxh_employer) + Number(r.bhyt_employer) + Number(r.bhtn_employer))}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
