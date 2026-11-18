// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 PeopleOS contributors
import { AlertTriangle, Check, Inbox, Loader2, RotateCcw } from 'lucide-react'
import { Component, type ErrorInfo, type ReactNode } from 'react'
import { Badge } from './ui/badge'
import { LEAVE_STATUS, PROPOSAL_STATUS, STATUS_LABEL, STEP_STATUS, statusTone } from '@/lib/format'
import { cn } from '@/lib/utils'

/** Tiêu đề trang. `howto` là phần giải thích quy trình, gập lại để không chiếm chỗ mỗi lần mở trang. */
export function PageHeader({ title, description, actions, howto }: { title: string; description?: ReactNode; actions?: ReactNode; howto?: { q: string; a: ReactNode } }) {
  return (
    <>
      <div className="page-heading flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1>{title}</h1>
          {description && <p className="mt-1.5 max-w-[68ch] leading-6 text-muted-foreground">{description}</p>}
        </div>
        {actions}
      </div>
      {howto && (
        <details className="po-howto">
          <summary>{howto.q}</summary>
          <p>{howto.a}</p>
        </details>
      )}
    </>
  )
}

export const Loading = () => (
  <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground" role="status"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Đang tải dữ liệu…</div>
)
export const ErrorBox = ({ message, onRetry }: { message: string; onRetry?: () => void }) => (
  <div className="po-error" role="alert">
    <AlertTriangle aria-hidden="true" />
    <span>{message}</span>
    {onRetry && <button type="button" onClick={onRetry}><RotateCcw aria-hidden="true" /> Thử lại</button>}
  </div>
)
export const Empty = ({ text }: { text: string }) => (
  <div className="empty-state flex flex-col items-center gap-2 py-10 text-sm text-muted-foreground"><Inbox className="h-6 w-6" aria-hidden="true" />{text}</div>
)

export function InfoRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="po-doc-row">
      <dt>{label}</dt>
      <dd>{value ?? '—'}</dd>
    </div>
  )
}

/**
 * Nhãn trạng thái dùng chung. Luôn có chữ: tra `map` riêng của trang, rồi bảng chung STATUS_LABEL,
 * cuối cùng mới hiện khoá gốc đã bỏ gạch dưới. Không bao giờ ra một viên rỗng.
 */
export function StatusBadge({ status, map, tone }: { status?: string | null; map?: Record<string, string>; tone?: 'success' | 'warning' | 'destructive' | 'secondary' }) {
  if (!status) return <span className="text-muted-foreground">—</span>
  const label = map?.[status] ?? STATUS_LABEL[status] ?? status.replace(/_/g, ' ')
  return <Badge variant={tone ?? statusTone(status)}>{label}</Badge>
}
export const LeaveBadge = ({ status }: { status: string }) => <StatusBadge status={status} map={LEAVE_STATUS} />
export const ProposalBadge = ({ status }: { status: string }) => <StatusBadge status={status} map={PROPOSAL_STATUS} />
export const StepBadge = ({ status }: { status: string }) => <StatusBadge status={status} map={STEP_STATUS} />

/**
 * Thanh tiến trình của một quy trình nhiều bước (kỳ lương, nghỉ việc, đề xuất lương).
 * `current` = chỉ số bước đang chờ; bằng steps.length nghĩa là đã xong. `returned` đánh dấu bước bị trả lại.
 */
export function Stepper({ steps, current, returned, label, compact }: { steps: string[]; current: number; returned?: boolean; label: string; compact?: boolean }) {
  if (compact) {
    // Bản gọn cho ô bảng: chỉ các chấm, tên bước nằm trong title và cho trình đọc màn hình
    return (
      <ol className="po-stepper compact" aria-label={label}>
        {steps.map((s, i) => {
          const state = i < current ? 'done' : i === current ? (returned ? 'returned' : 'current') : 'todo'
          return <li key={s} className={state} title={s} aria-current={state === 'current' || state === 'returned' ? 'step' : undefined}><span className="sr-only">{s}{state === 'done' ? ' (xong)' : state === 'todo' ? ' (chưa tới)' : ' (đang ở bước này)'}</span></li>
        })}
      </ol>
    )
  }
  return (
    <ol className="po-stepper" aria-label={label}>
      {steps.map((s, i) => {
        const state = i < current ? 'done' : i === current ? (returned ? 'returned' : 'current') : 'todo'
        return (
          <li key={s} className={state} aria-current={state === 'current' || state === 'returned' ? 'step' : undefined}>
            <i aria-hidden="true">{state === 'done' ? <Check /> : i + 1}</i>
            <span>{s}</span>
            {state === 'returned' && <span className="sr-only"> (bị trả lại)</span>}
          </li>
        )
      })}
    </ol>
  )
}

/** Khối "chứng từ": tờ giấy có tiêu đề kẻ đậm, dùng cho hồ sơ, hợp đồng, BHXH, kỳ lương. */
export function DocSheet({ title, meta, children, seal, className, as: Tag = 'section' }: {
  title: ReactNode; meta?: ReactNode; children: ReactNode; seal?: ReactNode; className?: string; as?: 'section' | 'article'
}) {
  return (
    <Tag className={cn('po-doc', className)}>
      <header className="po-doc-head">
        <h2>{title}</h2>
        {meta && <span>{meta}</span>}
      </header>
      {children}
      {seal && <div className="po-doc-seal">{seal}</div>}
    </Tag>
  )
}

/** Giữ khung ứng dụng khi một trang lỗi lúc hiển thị, thay vì trắng cả màn hình. */
export class PageErrorBoundary extends Component<{ children: ReactNode; resetKey: string }, { error: Error | null }> {
  state = { error: null as Error | null }
  static getDerivedStateFromError(error: Error) { return { error } }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error('[PeopleOS] Lỗi hiển thị trang', error, info.componentStack) }
  componentDidUpdate(prev: { resetKey: string }) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null })
  }
  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="po-crash" role="alert">
        <AlertTriangle aria-hidden="true" />
        <h1>Trang này đang gặp lỗi hiển thị</h1>
        <p>Dữ liệu của bạn không bị ảnh hưởng. Hãy tải lại trang; nếu vẫn lỗi, báo cho quản trị hệ thống kèm thời điểm xảy ra.</p>
        <div className="po-settings-actions">
          <button type="button" className="po-btn po-btn-primary" onClick={() => window.location.reload()}>Tải lại trang</button>
          <a className="po-btn po-btn-secondary" href="/">Về Tổng quan</a>
        </div>
        <details><summary>Chi tiết kỹ thuật</summary><code>{this.state.error.message}</code></details>
      </div>
    )
  }
}

/** Hiển thị lỗi/thành công của một hành động (gọi API) bằng toast. */
export const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e))
