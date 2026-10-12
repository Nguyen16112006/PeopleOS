import { Download } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useAuth } from '@/auth/AuthProvider'
import { Empty, ErrorBox, errMsg, Loading, PageHeader } from '@/components/common'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useToast } from '@/hooks/toast'
import { useQuery } from '@/hooks/useQuery'
import { download } from '@/lib/api'
import { cn } from '@/lib/utils'
import { fmtDate, monthLabel, vnd } from '@/lib/format'

const Q = `query Payslips($uid: uuid!) {
  payrolls(where: {employee: {user_id: {_eq: $uid}}}, order_by: [{period_year: desc}, {period_month: desc}]) {
    id period_year period_month base_salary allowance overtime_pay bonus gross insured_salary
    bhxh_employee bhyt_employee bhtn_employee taxable_income personal_income_tax net_salary paid_at
  }
}`

const Row = ({ label, value, strong, minus }: { label: string; value: number; strong?: boolean; minus?: boolean }) => (
  <div className={cn('flex justify-between border-b py-2 text-sm last:border-0', strong && 'font-semibold')}>
    <span className={strong ? '' : 'text-muted-foreground'}>{label}</span><span>{minus ? '− ' : ''}{vnd(value)}</span>
  </div>
)

export default function Payslips() {
  const { user } = useAuth()
  const { push } = useToast()
  const { data, loading, error } = useQuery<{ payrolls: any[] }>(Q, { uid: user.sub })
  const [selected, setSelected] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => { if (data && !selected && data.payrolls[0]) setSelected(data.payrolls[0].id) }, [data, selected])

  if (loading) return <Loading />
  if (error) return <ErrorBox message={error} />
  const list = data!.payrolls
  const p = list.find((x) => x.id === selected)

  const dl = async () => {
    if (!p) return
    setBusy(true)
    try { await download(`/api/payslips/${p.id}/download`, `payslip-${p.period_year}-${String(p.period_month).padStart(2, '0')}.pdf`) }
    catch (e) { push({ title: 'Không tải được phiếu lương', message: errMsg(e), kind: 'error' }) }
    finally { setBusy(false) }
  }

  return (
    <div>
      <PageHeader title="Bảng lương" description="Phiếu lương theo tháng - có thể tải PDF (lưu trên MinIO)" />
      {list.length === 0 ? <Empty text="Chưa có phiếu lương" /> : (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-1">
            <CardHeader><CardTitle>Các kỳ lương</CardTitle></CardHeader>
            <CardContent className="max-h-[28rem] space-y-1 overflow-auto">
              {list.map((x) => (
                <button key={x.id} onClick={() => setSelected(x.id)}
                  className={cn('flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm hover:bg-slate-100', x.id === selected && 'bg-primary/10 text-primary')}>
                  <span>{monthLabel(x.period_year, x.period_month)}</span><span className="font-medium">{vnd(x.net_salary)}</span>
                </button>
              ))}
            </CardContent>
          </Card>
          {p && (
            <Card className="lg:col-span-2">
              <CardHeader className="flex-row items-center justify-between space-y-0">
                <div><CardTitle>{monthLabel(p.period_year, p.period_month)}</CardTitle><p className="text-xs text-muted-foreground">Ngày chi trả: {fmtDate(p.paid_at)}</p></div>
                <Button size="sm" variant="outline" onClick={dl} disabled={busy}><Download className="h-4 w-4" /> Tải PDF</Button>
              </CardHeader>
              <CardContent className="grid gap-6 sm:grid-cols-2">
                <div>
                  <p className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Thu nhập</p>
                  <Row label="Lương cơ bản" value={p.base_salary} /><Row label="Phụ cấp" value={p.allowance} />
                  <Row label="Làm thêm giờ" value={p.overtime_pay} /><Row label="Thưởng" value={p.bonus} />
                  <Row label="Tổng thu nhập (Gross)" value={p.gross} strong />
                </div>
                <div>
                  <p className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Khấu trừ</p>
                  <Row label="BHXH 8%" value={p.bhxh_employee} minus /><Row label="BHYT 1,5%" value={p.bhyt_employee} minus />
                  <Row label="BHTN 1%" value={p.bhtn_employee} minus /><Row label="Thuế TNCN" value={p.personal_income_tax} minus />
                  <Row label="Thu nhập tính thuế" value={p.taxable_income} />
                </div>
                <div className="rounded-lg bg-emerald-50 p-4 sm:col-span-2">
                  <p className="text-sm text-emerald-800">Thực nhận (Net)</p>
                  <p className="text-3xl font-semibold text-emerald-700">{vnd(p.net_salary)}</p>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  )
}
