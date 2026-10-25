// SPDX-License-Identifier: Apache-2.0
import { cn } from '@/lib/utils'

export interface BarItem { label: string; value: number; hint?: string }

/** Biểu đồ thanh ngang - dùng div thuần, không cần thư viện. */
export function BarList({ items, format = (n) => String(n), color = 'bg-primary' }: { items: BarItem[]; format?: (n: number) => string; color?: string }) {
  const max = Math.max(1, ...items.map((i) => i.value))
  return (
    <div className="space-y-3">
      {items.map((i) => (
        <div key={i.label}>
          <div className="mb-1 flex justify-between text-sm"><span>{i.label}</span><span className="font-medium">{format(i.value)}</span></div>
          <div className="h-2.5 rounded-full bg-slate-100"><div className={cn('h-2.5 rounded-full', color)} style={{ width: `${(i.value / max) * 100}%` }} /></div>
          {i.hint && <p className="mt-0.5 text-xs text-muted-foreground">{i.hint}</p>}
        </div>
      ))}
    </div>
  )
}

export interface Series { name: string; color: string; values: number[] }

/** Biểu đồ cột nhóm theo nhãn (ví dụ: theo tháng). */
export function GroupedColumns({ labels, series, format = (n) => String(n) }: { labels: string[]; series: Series[]; format?: (n: number) => string }) {
  const max = Math.max(1, ...series.flatMap((s) => s.values))
  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-4 text-xs">
        {series.map((s) => <span key={s.name} className="flex items-center gap-1.5"><span className={cn('h-2.5 w-2.5 rounded-sm', s.color)} />{s.name}</span>)}
      </div>
      <div className="flex h-56 items-end gap-3 border-b pb-1">
        {labels.map((label, li) => (
          <div key={label} className="flex h-full flex-1 flex-col justify-end">
            <div className="flex flex-1 items-end justify-center gap-1">
              {series.map((s) => (
                <div key={s.name} title={`${s.name}: ${format(s.values[li])}`} className={cn('w-full max-w-[22px] rounded-t', s.color)}
                  style={{ height: `${(s.values[li] / max) * 100}%` }} />
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-1 flex gap-3">{labels.map((l) => <span key={l} className="flex-1 text-center text-xs text-muted-foreground">{l}</span>)}</div>
    </div>
  )
}
