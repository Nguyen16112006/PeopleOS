import type { InputHTMLAttributes, LabelHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

const field = 'flex w-full rounded-md border border-input bg-white px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50'

export const Input = ({ className, ...p }: InputHTMLAttributes<HTMLInputElement>) => <input className={cn(field, 'h-9', className)} {...p} />
export const Textarea = ({ className, ...p }: TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea className={cn(field, 'min-h-[72px]', className)} {...p} />
export const Select = ({ className, ...p }: SelectHTMLAttributes<HTMLSelectElement>) => <select className={cn(field, 'h-9', className)} {...p} />
export const Label = ({ className, ...p }: LabelHTMLAttributes<HTMLLabelElement>) => <label className={cn('text-sm font-medium leading-none', className)} {...p} />

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  )
}
