import { Download, FileText, Upload } from 'lucide-react'
import { useRef, useState } from 'react'
import { useAuth } from '@/auth/AuthProvider'
import { Empty, ErrorBox, errMsg, Loading, PageHeader } from '@/components/common'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useToast } from '@/hooks/toast'
import { useQuery } from '@/hooks/useQuery'
import { download, upload } from '@/lib/api'
import { CONTRACT_TYPES, fmtDate, vnd } from '@/lib/format'

const Q = `query Contracts($uid: uuid!) {
  contracts(where: {employee: {user_id: {_eq: $uid}}}, order_by: {start_date: desc}) {
    id contract_no contract_type start_date end_date base_salary allowance status file_key
  }
}`

export default function Contracts() {
  const { user, hasRole } = useAuth()
  const { push } = useToast()
  const { data, loading, error, reload } = useQuery<{ contracts: any[] }>(Q, { uid: user.sub })
  const [busy, setBusy] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const [target, setTarget] = useState<string | null>(null)

  const dl = async (c: any) => {
    setBusy(c.id)
    try { await download(`/api/contracts/${c.id}/download`, `${c.contract_no}.pdf`) }
    catch (e) { push({ title: 'Không tải được hợp đồng', message: errMsg(e), kind: 'error' }) }
    finally { setBusy(null) }
  }
  const onFile = async (f?: File) => {
    if (!f || !target) return
    try { await upload(`/api/contracts/${target}/upload`, f); push({ title: 'Đã tải bản ký lên MinIO', kind: 'success' }); reload() }
    catch (e) { push({ title: 'Tải lên thất bại', message: errMsg(e), kind: 'error' }) }
    if (fileRef.current) fileRef.current.value = ''
  }

  if (loading) return <Loading />
  if (error) return <ErrorBox message={error} />
  return (
    <div>
      <PageHeader title="Hợp đồng lao động" description="Hợp đồng của bạn, lưu trữ trên MinIO (object storage)" />
      <input ref={fileRef} type="file" accept="application/pdf" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
      {data!.contracts.length === 0 ? <Empty text="Chưa có hợp đồng" /> : (
        <div className="space-y-4">
          {data!.contracts.map((c) => (
            <Card key={c.id}>
              <CardHeader className="flex-row items-start justify-between space-y-0">
                <div className="flex items-center gap-3">
                  <FileText className="h-5 w-5 text-primary" />
                  <div><CardTitle>{c.contract_no}</CardTitle><p className="text-sm text-muted-foreground">{CONTRACT_TYPES[c.contract_type]}</p></div>
                </div>
                <Badge variant={c.status === 'active' ? 'success' : 'secondary'}>{c.status === 'active' ? 'Đang hiệu lực' : c.status}</Badge>
              </CardHeader>
              <CardContent>
                <div className="grid gap-3 text-sm sm:grid-cols-4">
                  <div><p className="text-muted-foreground">Bắt đầu</p><p className="font-medium">{fmtDate(c.start_date)}</p></div>
                  <div><p className="text-muted-foreground">Kết thúc</p><p className="font-medium">{c.end_date ? fmtDate(c.end_date) : 'Không thời hạn'}</p></div>
                  <div><p className="text-muted-foreground">Lương cơ bản</p><p className="font-medium">{vnd(c.base_salary)}</p></div>
                  <div><p className="text-muted-foreground">Phụ cấp</p><p className="font-medium">{vnd(c.allowance)}</p></div>
                </div>
                <div className="mt-4 flex gap-2">
                  <Button size="sm" variant="outline" disabled={busy === c.id} onClick={() => dl(c)}><Download className="h-4 w-4" /> Tải PDF</Button>
                  {hasRole('hr', 'admin') && (
                    <Button size="sm" variant="ghost" onClick={() => { setTarget(c.id); fileRef.current?.click() }}><Upload className="h-4 w-4" /> Tải bản ký lên</Button>
                  )}
                  {c.file_key && <span className="self-center text-xs text-muted-foreground">Đã lưu: {c.file_key}</span>}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
