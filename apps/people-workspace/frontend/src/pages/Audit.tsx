import { CheckCircle2, ShieldAlert, ShieldCheck } from 'lucide-react'
import { Fragment, useState } from 'react'
import { ErrorBox, errMsg, Loading, PageHeader } from '@/components/common'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/form'
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { useToast } from '@/hooks/toast'
import { useQuery } from '@/hooks/useQuery'
import { api } from '@/lib/api'
import { fmtDateTime } from '@/lib/format'

const Q = `query Audit($limit: Int!) {
  audit_logs(order_by: {seq: desc}, limit: $limit) { seq occurred_at actor_name actor_role action entity_type entity_id details prev_hash hash }
  audit_logs_aggregate { aggregate { count } }
}`

interface Verification { valid: boolean; checked: number; first_broken_seq: number | null; message: string }

export default function Audit() {
  const { push } = useToast()
  const { data, loading, error, reload } = useQuery<any>(Q, { limit: 200 })
  const [filter, setFilter] = useState('')
  const [open, setOpen] = useState<number | null>(null)
  const [verifying, setVerifying] = useState(false)
  const [result, setResult] = useState<Verification | null>(null)

  const verify = async () => {
    setVerifying(true)
    try { setResult(await api<Verification>('/api/audit/verify')) }
    catch (e) { push({ title: 'Không xác minh được', message: errMsg(e), kind: 'error' }) }
    finally { setVerifying(false) }
  }

  if (loading) return <Loading />
  if (error) return <ErrorBox message={error} />
  const rows: any[] = (data.audit_logs as any[]).filter((r) => !filter || `${r.action} ${r.entity_type} ${r.actor_name}`.toLowerCase().includes(filter.toLowerCase()))
  const total = data.audit_logs_aggregate.aggregate.count

  return (
    <div>
      <PageHeader title="Kiểm toán & nhật ký bất biến" description="Mọi hành động nghiệp vụ và thay đổi dữ liệu nhạy cảm đều được ghi vào chuỗi băm SHA-256; CSDL chặn sửa, xóa hoặc truncate."
        actions={<Button onClick={verify} disabled={verifying}><ShieldCheck className="h-4 w-4" /> {verifying ? 'Đang xác minh…' : 'Xác minh toàn vẹn chuỗi'}</Button>} />

      {result && (
        <div className={`mb-4 flex items-start gap-3 rounded-lg border p-4 ${result.valid ? 'border-emerald-200 bg-emerald-50' : 'border-red-200 bg-red-50'}`}>
          {result.valid ? <CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-600" /> : <ShieldAlert className="mt-0.5 h-5 w-5 text-red-600" />}
          <div>
            <p className={`font-medium ${result.valid ? 'text-emerald-800' : 'text-red-800'}`}>{result.valid ? 'Chuỗi nhật ký toàn vẹn' : 'PHÁT HIỆN NHẬT KÝ BỊ CAN THIỆP'}</p>
            <p className="text-sm">{result.message}</p>
            <p className="text-xs text-muted-foreground">Đã kiểm tra {result.checked} bản ghi{result.first_broken_seq ? ` · hỏng đầu tiên tại seq ${result.first_broken_seq}` : ''}</p>
          </div>
        </div>
      )}

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle>Nhật ký ({total} bản ghi, hiển thị mới nhất)</CardTitle>
          <div className="flex gap-2"><Input className="w-64" placeholder="Lọc: hành động, thực thể, người làm…" value={filter} onChange={(e) => setFilter(e.target.value)} />
            <Button variant="outline" size="sm" onClick={reload}>Tải lại</Button></div>
        </CardHeader>
        <CardContent>
          <Table>
            <THead><TR><TH>#</TH><TH>Thời gian</TH><TH>Người thực hiện</TH><TH>Hành động</TH><TH>Đối tượng</TH><TH>Hash</TH></TR></THead>
            <TBody>
              {rows.map((r) => (
                <Fragment key={r.seq}>
                  <TR className="cursor-pointer" onClick={() => setOpen(open === r.seq ? null : r.seq)}>
                    <TD>{r.seq}</TD><TD>{fmtDateTime(r.occurred_at)}</TD>
                    <TD>{r.actor_name ?? <span className="text-muted-foreground">CSDL / hệ thống</span>}{r.actor_role && <Badge variant="secondary" className="ml-2">{r.actor_role}</Badge>}</TD>
                    <TD><Badge variant={r.action.startsWith('DB.') ? 'outline' : r.action.includes('QUARANTINED') ? 'destructive' : 'default'}>{r.action}</Badge></TD>
                    <TD>{r.entity_type}</TD><TD className="font-mono text-xs">{r.hash.slice(0, 10)}…</TD>
                  </TR>
                  {open === r.seq && (
                    <TR key={`${r.seq}-d`}><TD colSpan={6} className="bg-slate-50">
                      <p className="text-xs"><b>Đối tượng:</b> {r.entity_type} / {r.entity_id}</p>
                      <p className="mt-1 break-all font-mono text-xs"><b>prev_hash:</b> {r.prev_hash}</p>
                      <p className="break-all font-mono text-xs"><b>hash:</b> {r.hash}</p>
                      <pre className="mt-2 max-h-48 overflow-auto rounded bg-white p-2 text-xs">{(() => { try { return JSON.stringify(JSON.parse(r.details), null, 2) } catch { return r.details } })()}</pre>
                    </TD></TR>
                  )}
                </Fragment>
              ))}
            </TBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
