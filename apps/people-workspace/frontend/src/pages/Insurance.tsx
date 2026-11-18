// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 PeopleOS contributors
import { useAuth } from '@/auth/AuthProvider'
import { DocSheet, Empty, ErrorBox, InfoRow, Loading, PageHeader } from '@/components/common'
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { useQuery } from '@/hooks/useQuery'
import { plainNum, vnd } from '@/lib/format'

const Q = `query Insurance($uid: uuid!) {
  employees(where: {user_id: {_eq: $uid}}, limit: 1) { full_name social_insurance_no health_insurance_no }
  insurance_records(where: {employee: {user_id: {_eq: $uid}}}, order_by: {period: desc}) {
    id period insured_salary bhxh_employee bhyt_employee bhtn_employee bhxh_employer bhyt_employer bhtn_employer
  }
}`

const n = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0)

export default function Insurance() {
  const { user } = useAuth()
  const { data, loading, error, reload } = useQuery<any>(Q, { uid: user.sub })

  if (loading) return <Loading />
  if (error) return <ErrorBox message={error} onRetry={reload} />

  const rows: any[] = data.insurance_records
  const emp = data.employees[0]
  const sum = (k: string) => rows.reduce((s, r) => s + n(r[k]), 0)
  const employee = sum('bhxh_employee') + sum('bhyt_employee') + sum('bhtn_employee')
  const employer = sum('bhxh_employer') + sum('bhyt_employer') + sum('bhtn_employer')
  const ym = (d: string) => `${d.slice(5, 7)}/${d.slice(0, 4)}`
  const years = rows.length >= 12 ? `, khoảng ${Math.floor(rows.length / 12)} năm${rows.length % 12 ? ` ${rows.length % 12} tháng` : ''}` : ''

  return (
    <div>
      <PageHeader title="BHXH, BHYT" description="Quá trình đóng bảo hiểm do công ty kê khai hằng tháng. Đối chiếu thêm trên ứng dụng VssID của Bảo hiểm xã hội Việt Nam." />

      <DocSheet title="Sổ bảo hiểm" meta={emp?.full_name ?? user.name}>
        <div className="po-doc-cols">
          <dl className="po-doc-rows">
            <InfoRow label="Số sổ BHXH" value={emp?.social_insurance_no || 'Chưa cập nhật, liên hệ HR'} />
            <InfoRow label="Số thẻ BHYT" value={emp?.health_insurance_no || 'Chưa cập nhật, liên hệ HR'} />
            <InfoRow label="Thời gian đã đóng tại công ty" value={`${rows.length} tháng${years}`} />
          </dl>
          <dl className="po-doc-rows">
            <InfoRow label="Bạn đã đóng (10,5%)" value={vnd(employee)} />
            <InfoRow label="Công ty đã đóng (21,5%)" value={vnd(employer)} />
            <InfoRow label="Tổng cộng" value={<b>{vnd(employee + employer)}</b>} />
          </dl>
        </div>
        <p className="po-doc-note">Phần bạn đóng gồm BHXH 8%, BHYT 1,5%, BHTN 1% trên lương đóng bảo hiểm; số này đã được trừ trên phiếu lương hằng tháng.</p>
      </DocSheet>

      <section className="po-panel mt-5" aria-labelledby="ins-history">
        <div className="po-panel-head"><h2 id="ins-history">Từng tháng</h2><span className="text-[14px] text-muted-foreground">{rows.length} kỳ kê khai</span></div>
        <div className="p-5 pt-3">
          {rows.length === 0 ? <Empty text="Chưa có dữ liệu đóng bảo hiểm. Dữ liệu có sau kỳ lương đầu tiên được chi trả." /> : (
            <Table>
              <THead><TR><TH>Kỳ</TH><TH className="text-right">Lương đóng BH</TH><TH className="text-right">BHXH 8%</TH><TH className="text-right">BHYT 1,5%</TH><TH className="text-right">BHTN 1%</TH><TH className="text-right">Công ty đóng</TH></TR></THead>
              <TBody>
                {rows.map((r) => (
                  <TR key={r.id}>
                    <TD className="font-medium tabular-nums">{ym(r.period)}</TD>
                    <TD className="text-right tabular-nums">{plainNum(r.insured_salary)}</TD>
                    <TD className="text-right tabular-nums">{plainNum(r.bhxh_employee)}</TD>
                    <TD className="text-right tabular-nums">{plainNum(r.bhyt_employee)}</TD>
                    <TD className="text-right tabular-nums">{plainNum(r.bhtn_employee)}</TD>
                    <TD className="text-right tabular-nums">{plainNum(n(r.bhxh_employer) + n(r.bhyt_employer) + n(r.bhtn_employer))}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </div>
      </section>
    </div>
  )
}
