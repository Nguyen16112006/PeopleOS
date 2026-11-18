// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 PeopleOS contributors
import { Download, Loader2, Upload } from 'lucide-react'
import { useRef, useState } from 'react'
import { useAuth } from '@/auth/AuthProvider'
import { DocSheet, Empty, ErrorBox, errMsg, InfoRow, Loading, PageHeader, StatusBadge } from '@/components/common'
import { Stamp } from '@/components/Stamp'
import { useToast } from '@/hooks/toast'
import { useQuery } from '@/hooks/useQuery'
import { download, upload } from '@/lib/api'
import { CONTRACT_TYPES, fmtDate, vnd } from '@/lib/format'

const Q = `query Contracts($uid: uuid!) {
  contracts(where: {employee: {user_id: {_eq: $uid}}}, order_by: {start_date: desc}) {
    id contract_no contract_type start_date end_date base_salary allowance status file_key
  }
}`
const CONTRACT_STATUS: Record<string, string> = { active: 'Đang hiệu lực', expired: 'Đã hết hạn', terminated: 'Đã chấm dứt', draft: 'Bản nháp' }

export default function Contracts() {
  const { user, hasRole } = useAuth()
  const { push } = useToast()
  const { data, loading, error, reload } = useQuery<{ contracts: any[] }>(Q, { uid: user.sub })
  const [busy, setBusy] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const [target, setTarget] = useState<string | null>(null)

  const dl = async (c: any) => {
    setBusy(c.id)
    try {
      await download(`/api/contracts/${c.id}/download`, `${c.contract_no}.pdf`)
    } catch (e) {
      push({ title: 'Không tải được hợp đồng', message: errMsg(e), kind: 'error' })
    } finally {
      setBusy(null)
    }
  }

  const onFile = async (f?: File) => {
    if (!f || !target) return
    try {
      await upload(`/api/contracts/${target}/upload`, f)
      push({ title: 'Đã lưu bản hợp đồng có chữ ký', kind: 'success' })
      reload()
    } catch (e) {
      push({ title: 'Tải lên thất bại', message: errMsg(e), kind: 'error' })
    }
    if (fileRef.current) fileRef.current.value = ''
  }

  if (loading) return <Loading />
  if (error) return <ErrorBox message={error} onRetry={reload} />

  return (
    <div>
      <PageHeader title="Hợp đồng lao động" description="Các hợp đồng bạn đã ký với công ty. Tải bản PDF bất cứ lúc nào." />
      <input ref={fileRef} type="file" accept="application/pdf" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />

      {data!.contracts.length === 0 ? (
        <Empty text="Bạn chưa có hợp đồng nào trên hệ thống. Nếu đã ký hợp đồng giấy, hãy nhắn HR để cập nhật." />
      ) : (
        data!.contracts.map((c) => (
          <DocSheet key={c.id} as="article" title={`Hợp đồng số ${c.contract_no}`} meta={<StatusBadge status={c.status} map={CONTRACT_STATUS} />}
            seal={c.file_key ? <Stamp label="Đã ký" ring="PHÒNG NHÂN SỰ ★ PEOPLEOS ★ HỢP ĐỒNG ★" size={104} /> : undefined}>
            <dl className="po-doc-rows max-w-[640px]">
              <InfoRow label="Loại hợp đồng" value={CONTRACT_TYPES[c.contract_type] ?? c.contract_type} />
              <InfoRow label="Hiệu lực" value={`${fmtDate(c.start_date)} đến ${c.end_date ? fmtDate(c.end_date) : 'không thời hạn'}`} />
              <InfoRow label="Lương cơ bản" value={vnd(c.base_salary)} />
              <InfoRow label="Phụ cấp" value={vnd(c.allowance)} />
              <InfoRow label="Bản có chữ ký" value={c.file_key ? 'Đã lưu trên hệ thống' : 'Chưa có, HR sẽ cập nhật sau khi ký'} />
            </dl>
            <div className="mt-4 flex flex-wrap gap-2.5">
              <button type="button" className="po-btn po-btn-primary" disabled={busy === c.id} onClick={() => dl(c)}>
                {busy === c.id ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Download aria-hidden="true" />}
                {busy === c.id ? 'Đang tải…' : 'Tải hợp đồng PDF'}
              </button>
              {hasRole('hr') && (
                <button type="button" className="po-btn po-btn-secondary" onClick={() => { setTarget(c.id); fileRef.current?.click() }}>
                  <Upload aria-hidden="true" /> Tải bản có chữ ký lên
                </button>
              )}
            </div>
          </DocSheet>
        ))
      )}
    </div>
  )
}
