import { AlertTriangle, Inbox, Loader2 } from 'lucide-react'
import type { ReactNode } from 'react'
import { Badge } from './ui/badge'
import { LEAVE_STATUS, PROPOSAL_STATUS, STEP_STATUS } from '@/lib/format'

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="page-heading mb-6 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">{description}</p>}
      </div>
      {actions}
    </div>
  )
}

export const Loading = () => (
  <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Đang tải…</div>
)
export const ErrorBox = ({ message }: { message: string }) => (
  <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> <span>{message}</span>
  </div>
)
export const Empty = ({ text }: { text: string }) => (
  <div className="empty-state flex flex-col items-center gap-2 py-10 text-sm text-muted-foreground"><Inbox className="h-6 w-6" />{text}</div>
)

export function InfoRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="grid grid-cols-3 gap-2 border-b py-2.5 text-sm last:border-0">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="col-span-2 font-medium">{value ?? '—'}</dd>
    </div>
  )
}

export const LeaveBadge = ({ status }: { status: string }) => (
  <Badge variant={status === 'approved' ? 'success' : status === 'rejected' ? 'destructive' : status === 'pending' ? 'warning' : 'secondary'}>
    {LEAVE_STATUS[status] ?? status}
  </Badge>
)
export const ProposalBadge = ({ status }: { status: string }) => (
  <Badge variant={status === 'approved' ? 'success' : status === 'rejected' ? 'destructive' : 'warning'}>{PROPOSAL_STATUS[status] ?? status}</Badge>
)
export const StepBadge = ({ status }: { status: string }) => (
  <Badge variant={status === 'approved' ? 'success' : status === 'rejected' ? 'destructive' : status === 'pending' ? 'warning' : 'secondary'}>
    {STEP_STATUS[status] ?? status}
  </Badge>
)

/** Hiển thị lỗi/thành công của một hành động (gọi API) bằng toast. */
export const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e))
