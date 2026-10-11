import { Bot, Send, User } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { PageHeader } from '@/components/common'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/form'
import { API_URL } from '@/lib/api'
import { getToken } from '@/lib/keycloak'
import { cn } from '@/lib/utils'

interface Msg { role: 'user' | 'assistant'; content: string; mode?: string; sources?: { source: string; heading: string }[] }

const SUGGESTIONS = [
  'Lương Gross 30 triệu thì thực nhận (Net) là bao nhiêu?',
  'Đơn nghỉ phép của tôi đang ở trạng thái nào?',
  'Tôi còn bao nhiêu ngày phép năm nay?',
  'Thời gian thử việc tối đa là bao lâu?',
  'Tỷ lệ đóng BHXH, BHYT, BHTN của người lao động?',
  'Mức giảm trừ gia cảnh năm 2026 là bao nhiêu?',
]
const MODE_LABEL: Record<string, string> = { calculator: 'Công cụ tính lương', tool: 'Dữ liệu nội bộ', error: 'Lỗi tra cứu' }

export default function Assistant() {
  const [msgs, setMsgs] = useState<Msg[]>([{ role: 'assistant', content: 'Xin chào! Mình là Trợ lý PeopleOS. Mình trả lời về Luật Lao động, BHXH, thuế TNCN, tính lương Gross → Net và tra cứu dữ liệu của chính bạn (đơn nghỉ phép, ngày phép, lương).' }])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const end = useRef<HTMLDivElement>(null)
  useEffect(() => { end.current?.scrollIntoView({ behavior: 'smooth' }) }, [msgs, busy])

  const send = async (text: string) => {
    const message = text.trim()
    if (!message || busy) return
    const history = msgs.filter((m) => m.role === 'user' || m.mode?.startsWith('llm')).map(({ role, content }) => ({ role, content }))
    setMsgs((m) => [...m, { role: 'user', content: message }])
    setInput(''); setBusy(true)
    try {
      const res = await fetch(`${API_URL}/ai/chat`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await getToken()}` },
        body: JSON.stringify({ message, history }),
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j.detail ?? j.message ?? `HTTP ${res.status}`)
      setMsgs((m) => [...m, { role: 'assistant', content: j.answer, mode: j.mode, sources: j.sources }])
    } catch (e: any) {
      setMsgs((m) => [...m, { role: 'assistant', content: `Xin lỗi, dịch vụ AI chưa phản hồi (${e.message}).`, mode: 'error' }])
    } finally { setBusy(false) }
  }

  return (
    <div className="flex h-[calc(100vh-9rem)] flex-col">
      <PageHeader title="Trợ lý AI" description="RAG chạy cục bộ (Ollama + Qdrant) trên Luật Lao động, BHXH, thuế TNCN và dữ liệu nội bộ theo quyền của bạn" />
      <div className="flex-1 space-y-4 overflow-auto rounded-lg border bg-white p-4">
        {msgs.map((m, i) => (
          <div key={i} className={cn('flex gap-3', m.role === 'user' && 'flex-row-reverse')}>
            <div className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-full', m.role === 'user' ? 'bg-primary text-white' : 'bg-slate-100')}>
              {m.role === 'user' ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
            </div>
            <div className={cn('max-w-[80%] rounded-lg px-4 py-2.5 text-sm', m.role === 'user' ? 'bg-primary text-white' : 'bg-slate-50')}>
              <p className="whitespace-pre-wrap">{m.content}</p>
              {m.role === 'assistant' && (m.mode || m.sources?.length) && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {m.mode && <Badge variant="secondary">{MODE_LABEL[m.mode] ?? (m.mode.startsWith('extractive') ? 'Trích dẫn (LLM chưa sẵn sàng)' : 'RAG · ' + m.mode)}</Badge>}
                  {m.sources?.slice(0, 3).map((s, k) => <Badge key={k} variant="outline">{s.heading}</Badge>)}
                </div>
              )}
            </div>
          </div>
        ))}
        {busy && <p className="text-sm text-muted-foreground">Trợ lý đang suy nghĩ…</p>}
        <div ref={end} />
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {SUGGESTIONS.map((s) => <button key={s} onClick={() => send(s)} className="rounded-full border bg-white px-3 py-1 text-xs hover:bg-slate-50">{s}</button>)}
      </div>
      <form className="mt-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); send(input) }}>
        <Input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Hỏi về luật lao động, BHXH, thuế, lương Net, đơn nghỉ phép…" />
        <Button type="submit" disabled={busy}><Send className="h-4 w-4" /> Gửi</Button>
      </form>
    </div>
  )
}
