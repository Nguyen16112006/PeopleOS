// SPDX-License-Identifier: Apache-2.0
import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'
import { CheckCircle2, Info, XCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

type Kind = 'info' | 'success' | 'error'
interface Toast { id: number; title: string; message?: string; kind: Kind }
const Ctx = createContext<{ push: (t: Omit<Toast, 'id' | 'kind'> & { kind?: Kind }) => void }>({ push: () => {} })
export const useToast = () => useContext(Ctx)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([])
  const push = useCallback((t: Omit<Toast, 'id' | 'kind'> & { kind?: Kind }) => {
    const id = Date.now() + Math.random()
    setItems((x) => [...x, { id, kind: 'info', ...t }])
    setTimeout(() => setItems((x) => x.filter((i) => i.id !== id)), 6000)
  }, [])
  return (
    <Ctx.Provider value={{ push }}>
      {children}
      <div className="fixed bottom-4 right-4 z-50 flex w-80 flex-col gap-2">
        {items.map((t) => (
          <div key={t.id} className={cn('flex gap-3 rounded-lg border bg-white p-3 shadow-lg animate-in',
            t.kind === 'error' && 'border-red-200', t.kind === 'success' && 'border-emerald-200')}>
            {t.kind === 'error' ? <XCircle className="h-5 w-5 shrink-0 text-red-500" /> :
              t.kind === 'success' ? <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-500" /> :
                <Info className="h-5 w-5 shrink-0 text-primary" />}
            <div className="min-w-0">
              <p className="text-sm font-medium">{t.title}</p>
              {t.message && <p className="mt-0.5 text-xs text-muted-foreground">{t.message}</p>}
            </div>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  )
}
