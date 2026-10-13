import {
  Bot,
  Compass,
  Loader2,
  Send,
  Sparkles,
  User,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
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
    <div className="assistant-page -mt-4 flex h-[calc(100vh-6.5rem)] flex-col space-y-4">
      {/* Title Header */}
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">Trợ lý AI</h1>
        <p className="mt-1 text-base font-medium text-slate-500">
          RAG cục bộ (Ollama + Qdrant) giải đáp Luật Lao động, BHXH, thuế TNCN và tra cứu dữ liệu cá nhân
        </p>
      </div>

      {/* Chat Container Card */}
      <div className="flex flex-1 flex-col overflow-hidden rounded-2xl border border-slate-100/90 bg-white shadow-[0_2px_12px_rgba(0,0,0,0.03)]">
        {/* Messages Stream */}
        <div className="flex-1 space-y-5 overflow-y-auto p-5 sm:p-6">
          {msgs.map((m, i) => {
            const isUser = m.role === 'user'
            return (
              <div
                key={i}
                className={cn('flex items-start gap-3.5', isUser ? 'flex-row-reverse' : 'flex-row')}
              >
                {/* Avatar */}
                <div
                  className={cn(
                    'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl shadow-xs text-white',
                    isUser
                      ? 'bg-gradient-to-br from-blue-500 to-blue-700'
                      : 'bg-gradient-to-br from-indigo-500 to-blue-600'
                  )}
                >
                  {isUser ? <User className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
                </div>

                {/* Message Bubble */}
                <div
                  className={cn(
                    'max-w-[85%] sm:max-w-[75%] rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-2xs',
                    isUser
                      ? 'rounded-tr-xs bg-[#1D68F2] text-white font-medium'
                      : 'rounded-tl-xs bg-slate-50/90 border border-slate-100 text-slate-800'
                  )}
                >
                  <p className="whitespace-pre-wrap">{m.content}</p>

                  {/* Mode & Sources badges */}
                  {!isUser && (m.mode || m.sources?.length) && (
                    <div className="mt-2.5 flex flex-wrap items-center gap-1.5 pt-2 border-t border-slate-200/60">
                      {m.mode && (
                        <span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-semibold text-[#1D4ED8] border border-blue-100">
                          {MODE_LABEL[m.mode] ??
                            (m.mode.startsWith('extractive')
                              ? 'Trích dẫn tài liệu'
                              : 'RAG · ' + m.mode)}
                        </span>
                      )}
                      {m.sources?.slice(0, 3).map((s, k) => (
                        <span
                          key={k}
                          className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600 border border-slate-200/80"
                        >
                          {s.heading}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )
          })}

          {/* Busy / Thinking state */}
          {busy && (
            <div className="flex items-start gap-3.5">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-blue-600 text-white shadow-xs">
                <Sparkles className="h-4 w-4 animate-spin" />
              </div>
              <div className="flex items-center gap-2 rounded-2xl rounded-tl-xs border border-slate-100 bg-slate-50/90 px-4 py-3 text-sm text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
                <span>Trợ lý đang suy nghĩ và tra cứu…</span>
              </div>
            </div>
          )}

          <div ref={end} />
        </div>

        {/* Suggestion Chips & Input Footer */}
        <div className="border-t border-slate-100 bg-slate-50/40 p-4 sm:p-5 space-y-3">
          {/* Suggestions */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
            <span className="flex items-center gap-1 text-xs font-semibold text-slate-400 shrink-0">
              <Compass className="h-3.5 w-3.5" /> Gợi ý:
            </span>
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                onClick={() => send(s)}
                className="shrink-0 rounded-xl border border-slate-200/80 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-2xs hover:border-blue-400 hover:bg-blue-50/60 hover:text-blue-700 transition-colors"
              >
                {s}
              </button>
            ))}
          </div>

          {/* Form Input */}
          <form
            className="flex items-center gap-2.5"
            onSubmit={(e) => {
              e.preventDefault()
              send(input)
            }}
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Hỏi về luật lao động, BHXH, thuế TNCN, lương Net, đơn nghỉ phép…"
              className="flex-1 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-800 shadow-2xs placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <button
              type="submit"
              disabled={busy || !input.trim()}
              className="flex items-center gap-2 rounded-xl bg-[#2563EB] px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-50 transition-colors shrink-0"
            >
              <Send className="h-4 w-4" />
              <span className="hidden sm:inline">Gửi</span>
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
