// SPDX-License-Identifier: Apache-2.0 AND MIT
// SPDX-FileCopyrightText: 2026 PeopleOS contributors
// SPDX-FileCopyrightText: 2023 shadcn
// Phỏng theo thành phần của shadcn/ui (https://github.com/shadcn-ui/ui, giấy phép MIT),
// đã được PeopleOS rút gọn và chỉnh sửa. Bản quyền và giấy phép gốc: LICENSES/MIT.txt.

import type { HTMLAttributes, TdHTMLAttributes, ThHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

export const Table = ({ className, ...p }: HTMLAttributes<HTMLTableElement>) => (
  <div className="w-full overflow-auto"><table className={cn('w-full text-sm', className)} {...p} /></div>
)
export const THead = (p: HTMLAttributes<HTMLTableSectionElement>) => <thead className="border-b text-left" {...p} />
export const TBody = (p: HTMLAttributes<HTMLTableSectionElement>) => <tbody className="divide-y" {...p} />
export const TR = ({ className, ...p }: HTMLAttributes<HTMLTableRowElement>) => <tr className={cn('transition-colors hover:bg-slate-50/70', className)} {...p} />
export const TH = ({ className, ...p }: ThHTMLAttributes<HTMLTableCellElement>) => (
  <th className={cn('px-3 py-2.5 text-[13.5px] font-semibold text-muted-foreground whitespace-nowrap', className)} {...p} />
)
export const TD = ({ className, ...p }: TdHTMLAttributes<HTMLTableCellElement>) => <td className={cn('px-3 py-3 align-middle', className)} {...p} />
