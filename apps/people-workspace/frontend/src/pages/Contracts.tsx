// SPDX-License-Identifier: Apache-2.0
import {
  Calendar,
  CheckCircle2,
  Clock,
  Download,
  FileText,
  Loader2,
  ShieldCheck,
  Upload,
  Wallet,
} from 'lucide-react'
import { useRef, useState } from 'react'
import { useAuth } from '@/auth/AuthProvider'
import { Empty, ErrorBox, errMsg, Loading } from '@/components/common'
import { useToast } from '@/hooks/toast'
import { useQuery } from '@/hooks/useQuery'
import { download, upload } from '@/lib/api'
import { CONTRACT_TYPES, fmtDate, vnd } from '@/lib/format'
import { cn } from '@/lib/utils'

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
      push({ title: 'Đã tải bản ký lên MinIO', kind: 'success' })
      reload()
    } catch (e) {
      push({ title: 'Tải lên thất bại', message: errMsg(e), kind: 'error' })
    }
    if (fileRef.current) fileRef.current.value = ''
  }

  if (loading) return <Loading />
  if (error) return <ErrorBox message={error} />

  return (
    <div className="-mt-4 space-y-6">
      {/* Title Header */}
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">Hợp đồng lao động</h1>
        <p className="mt-1 text-base font-medium text-slate-500">
          Hợp đồng lao động và văn bản pháp lý của bạn, lưu trữ an toàn trên MinIO
        </p>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="application/pdf"
        className="hidden"
        onChange={(e) => onFile(e.target.files?.[0])}
      />

      {data!.contracts.length === 0 ? (
        <Empty text="Chưa có hợp đồng" />
      ) : (
        <div className="space-y-4">
          {data!.contracts.map((c) => (
            <div
              key={c.id}
              className="rounded-2xl border border-slate-100/90 bg-white p-6 shadow-[0_2px_12px_rgba(0,0,0,0.03)] hover:shadow-[0_8px_25px_rgba(0,0,0,0.06)] transition-all"
            >
              {/* Header row */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-5">
                <div className="flex items-center gap-4">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#EFF6FF] text-[#2563EB]">
                    <FileText className="h-6 w-6" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-base font-bold text-slate-900">{c.contract_no}</span>
                    </div>
                    <p className="text-sm font-medium text-slate-500">
                      {CONTRACT_TYPES[c.contract_type] ?? c.contract_type}
                    </p>
                  </div>
                </div>

                <div>
                  <span
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold',
                      c.status === 'active'
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        : 'bg-slate-100 text-slate-600 border border-slate-200'
                    )}
                  >
                    {c.status === 'active' ? (
                      <>
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                        <span>Đang hiệu lực</span>
                      </>
                    ) : (
                      c.status
                    )}
                  </span>
                </div>
              </div>

              {/* Metrics grid */}
              <div className="mt-5 grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                <div className="rounded-xl bg-slate-50/70 p-4 border border-slate-100/80">
                  <div className="flex items-center gap-1.5 text-xs font-medium text-slate-400">
                    <Calendar className="h-3.5 w-3.5" />
                    <span>Ngày bắt đầu</span>
                  </div>
                  <p className="mt-1 text-base font-bold text-slate-900">{fmtDate(c.start_date)}</p>
                </div>

                <div className="rounded-xl bg-slate-50/70 p-4 border border-slate-100/80">
                  <div className="flex items-center gap-1.5 text-xs font-medium text-slate-400">
                    <Clock className="h-3.5 w-3.5" />
                    <span>Ngày kết thúc</span>
                  </div>
                  <p className="mt-1 text-base font-bold text-slate-900">
                    {c.end_date ? fmtDate(c.end_date) : 'Không thời hạn'}
                  </p>
                </div>

                <div className="rounded-xl bg-slate-50/70 p-4 border border-slate-100/80">
                  <div className="flex items-center gap-1.5 text-xs font-medium text-slate-400">
                    <Wallet className="h-3.5 w-3.5 text-emerald-600" />
                    <span>Lương cơ bản</span>
                  </div>
                  <p className="mt-1 text-base font-bold text-emerald-700">{vnd(c.base_salary)}</p>
                </div>

                <div className="rounded-xl bg-slate-50/70 p-4 border border-slate-100/80">
                  <div className="flex items-center gap-1.5 text-xs font-medium text-slate-400">
                    <Wallet className="h-3.5 w-3.5 text-blue-600" />
                    <span>Phụ cấp</span>
                  </div>
                  <p className="mt-1 text-base font-bold text-slate-900">{vnd(c.allowance)}</p>
                </div>
              </div>

              {/* Action row */}
              <div className="mt-5 flex flex-wrap items-center justify-between gap-3 pt-2">
                <div className="flex flex-wrap items-center gap-2.5">
                  <button
                    disabled={busy === c.id}
                    onClick={() => dl(c)}
                    className="flex items-center gap-2 rounded-xl bg-[#2563EB] px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-60 transition-colors"
                  >
                    {busy === c.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Download className="h-4 w-4" />
                    )}
                    <span>{busy === c.id ? 'Đang tải…' : 'Tải PDF'}</span>
                  </button>

                  {hasRole('hr', 'admin') && (
                    <button
                      onClick={() => {
                        setTarget(c.id)
                        fileRef.current?.click()
                      }}
                      className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 transition-colors"
                    >
                      <Upload className="h-4 w-4 text-slate-500" />
                      <span>Tải bản ký lên</span>
                    </button>
                  )}
                </div>

                {c.file_key && (
                  <div className="flex items-center gap-1.5 text-xs text-slate-400 font-mono">
                    <ShieldCheck className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                    <span className="truncate max-w-xs sm:max-w-md">Đã lưu: {c.file_key}</span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
