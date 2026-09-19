import { useState, useEffect, useRef } from 'react'
import client from '../api/client'

export default function IncidentChat({
  eventId,
  senderType = 'scanner',
  sessionToken = null,
  isHighContrast = false,
  placeholderText = 'Type a message...'
}) {
  const [messages, setMessages] = useState([])
  const [inputText, setInputText] = useState('')
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState('')
  const chatContainerRef = useRef(null)
  const prevMsgCountRef = useRef(0)

  const fetchMessages = async () => {
    if (!eventId) return
    try {
      const config = {}
      if (sessionToken) {
        config.headers = { 'X-Session-Token': sessionToken }
      }
      const res = await client.get(`/incident/${eventId}/chat`, config)
      setMessages((prev) => {
        if (
          prev.length === res.data.length &&
          (prev.length === 0 || prev[prev.length - 1].id === res.data[res.data.length - 1]?.id)
        ) {
          return prev
        }
        return res.data
      })
    } catch (err) {
      console.warn('Failed to load incident chat messages', err)
    }
  }

  useEffect(() => {
    fetchMessages()
    const timer = setInterval(fetchMessages, 3000)
    return () => clearInterval(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId, sessionToken])

  useEffect(() => {
    if (messages.length > prevMsgCountRef.current) {
      if (chatContainerRef.current) {
        chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight
      }
    }
    prevMsgCountRef.current = messages.length
  }, [messages])

  const handleSend = async (e) => {
    e.preventDefault()
    if (!inputText.trim() || sending) return

    setSending(true)
    setSendError('')
    try {
      const config = {}
      if (sessionToken) {
        config.headers = { 'X-Session-Token': sessionToken }
      }
      await client.post(
        `/incident/${eventId}/chat`,
        {
          message: inputText.trim(),
          sender_type: senderType,
          session_token: sessionToken,
        },
        config
      )
      setInputText('')
      await fetchMessages()
      if (chatContainerRef.current) {
        chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight
      }
    } catch (err) {
      console.error('Failed to send message', err)
      setSendError('Failed to send message. Please try again.')
    } finally {
      setSending(false)
    }
  }

  const bgPanel = isHighContrast
    ? 'bg-black border-2 border-yellow-400 text-yellow-300'
    : 'bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 text-slate-900 dark:text-slate-100'
  const chatBubbleUser = isHighContrast ? 'bg-yellow-400 text-black font-bold' : 'bg-brand-600 text-white'
  const chatBubbleOther = isHighContrast
    ? 'bg-zinc-800 text-white border border-yellow-300'
    : 'bg-gray-100 dark:bg-slate-800 text-gray-800 dark:text-slate-200'

  return (
    <div className={`rounded-xl shadow-sm overflow-hidden flex flex-col ${bgPanel}`}>
      <div className={`px-4 py-2 text-xs font-semibold uppercase tracking-wider flex items-center justify-between border-b ${
        isHighContrast
          ? 'border-yellow-400 bg-zinc-900 text-yellow-300'
          : 'bg-gray-50 dark:bg-slate-800/80 border-gray-200 dark:border-slate-700 text-gray-600 dark:text-slate-400'
      }`}>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
          Live In-App Coordination Channel
        </span>
        <span className="text-[10px] opacity-75">Masked & Protected</span>
      </div>

      {/* Message history */}
      <div ref={chatContainerRef} className="p-3 h-52 overflow-y-auto space-y-2 text-sm">
        {messages.length === 0 ? (
          <div className="h-full flex items-center justify-center text-xs opacity-60 italic text-center px-4">
            No messages yet. Send a direct, secure message here to coordinate safely.
          </div>
        ) : (
          messages.map((m) => {
            const isMe = m.sender_type === senderType
            return (
              <div
                key={m.id}
                className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}
              >
                <span className="text-[10px] opacity-60 mb-0.5 px-1 font-medium">
                  {m.sender_name || (isMe ? 'You' : 'Other Party')} •{' '}
                  {new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
                <div
                  className={`max-w-[82%] px-3 py-1.5 rounded-lg text-sm break-words ${
                    isMe ? chatBubbleUser : chatBubbleOther
                  }`}
                >
                  {m.message}
                </div>
              </div>
            )
          })
        )}
      </div>

      {sendError && (
        <div className="text-[11px] text-red-500 bg-red-50 dark:bg-red-950/40 px-3 py-1 border-t border-red-200">
          ⚠️ {sendError}
        </div>
      )}

      {/* Input bar */}
      <form onSubmit={handleSend} className={`p-2 border-t flex gap-2 ${
        isHighContrast
          ? 'border-yellow-400 bg-zinc-900'
          : 'border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/60'
      }`}>
        <input
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder={placeholderText}
          disabled={sending}
          className={`flex-1 px-3 py-1.5 text-sm rounded-lg outline-none transition ${
            isHighContrast
              ? 'bg-black border border-yellow-400 text-yellow-300 placeholder-yellow-600'
              : 'border border-gray-300 dark:border-slate-700 focus:border-brand-500 bg-white dark:bg-slate-900 text-gray-800 dark:text-slate-100'
          }`}
        />
        <button
          type="submit"
          disabled={!inputText.trim() || sending}
          className={`px-4 py-1.5 text-sm font-semibold rounded-lg transition disabled:opacity-50 ${
            isHighContrast
              ? 'bg-yellow-400 text-black hover:bg-yellow-300'
              : 'bg-brand-600 text-white hover:bg-brand-500'
          }`}
        >
          {sending ? '...' : 'Send'}
        </button>
      </form>
    </div>
  )
}
