// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 PeopleOS contributors
import { Bot, Loader2, Send, User } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { PageHeader } from '@/components/common'
import { Input } from '@/components/ui/form'
import { API_URL } from '@/lib/api'
import { getToken } from '@/lib/keycloak'
import { cn } from '@/lib/utils'

interface Msg {
  role: 'user' | 'assistant'
  content: string
  mode?: string
  sources?: { source: string; heading: string }[]
}

const SUGGESTIONS = [
  'Lương Gross 30 triệu thì thực nhận (Net) là bao nhiêu?',
  'Đơn nghỉ phép của tôi đang ở trạng thái nào?',
  'Tôi còn bao nhiêu ngày phép năm nay?',
  'Thời gian thử việc tối đa là bao lâu?',
  'Tỷ lệ đóng BHXH, BHYT, BHTN của người lao động?',
  'Mức giảm trừ gia cảnh năm 2026 là bao nhiêu?',
]

const MODE_LABEL: Record<string, string> = {
  calculator: 'Công cụ tính lương',
  tool: 'Dữ liệu nội bộ',
  error: 'Lỗi tra cứu',
}

export default function Assistant() {
  const [msgs, setMsgs] = useState<Msg[]>([
    {
      role: 'assistant',
      content:
        'Xin chào! Mình là Trợ lý PeopleOS. Mình trả lời về Luật Lao động, BHXH, thuế TNCN, tính lương Gross → Net và tra cứu dữ liệu của chính bạn (đơn nghỉ phép, ngày phép, lương).',
    },
  ])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const end = useRef<HTMLDivElement>(null)

  useEffect(() => {
    end.current?.scrollIntoView({ behavior: 'smooth' })
  }, [msgs, busy])

  const send = async (text: string) => {
    const message = text.trim()
    if (!message || busy) return
    const history = msgs
      .filter((m) => m.role === 'user' || m.mode?.startsWith('llm'))
      .map(({ role, content }) => ({ role, content }))
      .slice(-6) // máy chủ chỉ dùng 6 lượt cuối

    setMsgs((m) => [...m, { role: 'user', content: message }])
    setInput('')
    setBusy(true)

    try {
      const res = await fetch(`${API_URL}/ai/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${await getToken()}`,
        },
        body: JSON.stringify({ message, history }),
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j.detail ?? j.message ?? `HTTP ${res.status}`)
      setMsgs((m) => [
        ...m,
        { role: 'assistant', content: j.answer, mode: j.mode, sources: j.sources },
      ])
    } catch (e: any) {
      setMsgs((m) => [
        ...m,
        {
          role: 'assistant',
          content: `Xin lỗi, dịch vụ AI chưa phản hồi (${e.message}).`,
          mode: 'error',
        },
      ])
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="assistant-page flex flex-col">
      <PageHeader title="Trợ lý AI" description="Hỏi về Luật Lao động, BHXH, thuế TNCN, hoặc về lương và ngày phép của chính bạn. Trợ lý chạy trên máy chủ của công ty, câu hỏi không gửi ra ngoài." />

      <section className="po-panel po-chat" aria-label="Hội thoại với trợ lý">
        <div className="po-chat-log" role="log" aria-live="polite">
          {msgs.map((m, i) => {
            const isUser = m.role === 'user'
            return (
              <div key={i} className={cn('po-msg', isUser ? 'me' : 'bot')}>
                <span className="po-msg-who" aria-hidden="true">{isUser ? <User /> : <Bot />}</span>
                <div className="po-msg-body">
                  <span className="sr-only">{isUser ? 'Bạn:' : 'Trợ lý:'}</span>
                  <p className="whitespace-pre-wrap">{m.content}</p>
                  {!isUser && (m.mode || m.sources?.length) ? (
                    <div className="po-msg-sources">
                      {m.mode && <span>{MODE_LABEL[m.mode] ?? (m.mode.startsWith('extractive') ? 'Trích từ tài liệu' : 'Trả lời từ tài liệu')}</span>}
                      {m.sources?.slice(0, 3).map((s, k) => <span key={k}>{s.heading}</span>)}
                    </div>
                  ) : null}
                </div>
              </div>
            )
          })}
          {busy && (
            <div className="po-msg bot">
              <span className="po-msg-who" aria-hidden="true"><Bot /></span>
              <div className="po-msg-body text-muted-foreground"><Loader2 className="mr-2 inline h-4 w-4 animate-spin" aria-hidden="true" />Đang tra cứu tài liệu…</div>
            </div>
          )}
          <div ref={end} />
        </div>

        <div className="po-chat-foot">
          <div className="po-chat-suggest" aria-label="Câu hỏi gợi ý">
            {SUGGESTIONS.map((s) => (
              <button key={s} type="button" className="po-chip" onClick={() => send(s)} disabled={busy}>{s}</button>
            ))}
          </div>
          <form className="flex items-center gap-2.5" onSubmit={(e) => { e.preventDefault(); send(input) }}>
            <label htmlFor="po-chat-input" className="sr-only">Câu hỏi của bạn</label>
            <Input id="po-chat-input" value={input} onChange={(e) => setInput(e.target.value)} className="flex-1"
              placeholder="Ví dụ: tôi còn bao nhiêu ngày phép?" />
            <button type="submit" disabled={busy || !input.trim()} className="po-btn po-btn-primary">
              <Send aria-hidden="true" /><span className="hidden sm:inline">Gửi</span>
            </button>
          </form>
        </div>
      </section>
    </div>
  )
}
