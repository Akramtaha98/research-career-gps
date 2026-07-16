import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useResearcher } from '../context/ResearcherContext';
import { getBotReply, getInitialSuggestions } from '../utils/chatAssistant';

/**
 * Site-wide "ask about my H-index" chat assistant — a small floating panel,
 * mounted once globally (App.jsx), bottom-left (FeedbackWidget already owns
 * bottom-right). Every reply is grounded in this researcher's real tracked
 * data via utils/chatAssistant.js (h-index, frontier, action items, the same
 * projection model Predictor.jsx uses) — see that file's top comment for why
 * this is a rule-based assistant rather than a general LLM call: it can't
 * invent a citation count or give advice that doesn't apply to this person.
 *
 * Bot reply TEXT is English-only for v1 (see chatAssistant.js) — the widget
 * chrome (button label, placeholder, header) is still fully translated via
 * the "chat" i18n namespace, same as the rest of the app.
 */
export default function ChatWidget() {
  const { t } = useTranslation();
  const { researcher, papers, source } = useResearcher();

  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]); // { role: 'user' | 'bot', text }
  const [input, setInput] = useState('');
  const [typing, setTyping] = useState(false);
  const scrollRef = useRef(null);

  const chatContext = { hasResearcher: papers.length > 0, researcherName: researcher?.name, papers, source };

  useEffect(() => {
    if (open && messages.length === 0) {
      const { text, suggestions } = getBotReply('hello', chatContext);
      setMessages([{ role: 'bot', text, suggestions }]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, typing]);

  function send(text) {
    const trimmed = (text || '').trim();
    if (!trimmed || typing) return;
    setMessages((prev) => [...prev, { role: 'user', text: trimmed }]);
    setInput('');
    setTyping(true);
    // A brief, deliberately short delay before the reply lands — makes the
    // conversation feel considered rather than a jarring instant echo, at a
    // duration far below anything a user would perceive as "slow".
    setTimeout(() => {
      const { text: replyText, suggestions } = getBotReply(trimmed, chatContext);
      setMessages((prev) => [...prev, { role: 'bot', text: replyText, suggestions }]);
      setTyping(false);
    }, 450 + Math.random() * 250);
  }

  function handleSubmit(e) {
    e.preventDefault();
    send(input);
  }

  const lastSuggestions = [...messages].reverse().find((m) => m.role === 'bot')?.suggestions
    || getInitialSuggestions(chatContext);

  return (
    <>
      {open && (
        <div className="fixed bottom-20 left-4 sm:left-5 z-40 w-[calc(100vw-2rem)] sm:w-96 max-h-[70vh] flex flex-col rounded-2xl shadow-2xl border border-slate-100 bg-white overflow-hidden">
          <div className="flex items-center justify-between gap-2 px-4 py-3 bg-brand-gradient text-white shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-lg leading-none" aria-hidden="true">🧭</span>
              <div className="min-w-0">
                <p className="text-sm font-semibold truncate">{t('chat.title')}</p>
                <p className="text-[11px] text-white/80 truncate">{t('chat.subtitle')}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label={t('chat.close')}
              className="shrink-0 w-7 h-7 flex items-center justify-center rounded-lg text-white/90 hover:bg-white/15 transition"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <line x1="6" y1="6" x2="18" y2="18" />
                <line x1="18" y1="6" x2="6" y2="18" />
              </svg>
            </button>
          </div>

          <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-2.5 bg-slate-50">
            {messages.map((m, i) => (
              <ChatBubble key={i} role={m.role} text={m.text} />
            ))}
            {typing && <TypingBubble />}
          </div>

          {!typing && lastSuggestions?.length > 0 && (
            <div className="flex flex-wrap gap-1.5 px-3 pt-2 pb-1 bg-slate-50 border-t border-slate-100 shrink-0">
              {lastSuggestions.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => send(s)}
                  className="text-[11px] leading-tight px-2.5 py-1.5 rounded-full bg-white border border-slate-200 text-slate-600 hover:border-brand-300 hover:text-brand-700 transition"
                >
                  {s}
                </button>
              ))}
            </div>
          )}

          <form onSubmit={handleSubmit} className="flex items-center gap-2 p-2.5 border-t border-slate-100 bg-white shrink-0">
            <input
              type="text"
              autoComplete="off"
              name="chat-message"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={t('chat.placeholder')}
              className="flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-100 outline-none transition"
            />
            <button
              type="submit"
              disabled={!input.trim() || typing}
              aria-label={t('chat.send')}
              className="shrink-0 w-9 h-9 flex items-center justify-center rounded-xl bg-brand-600 text-white disabled:opacity-40 hover:bg-brand-700 transition"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M2.5 12l19-9-7 9 7 9-19-9z" />
              </svg>
            </button>
          </form>
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="fixed bottom-5 left-5 z-40 flex items-center gap-2 rounded-full bg-brand-gradient px-4 py-3 text-sm font-semibold text-white shadow-lg hover:shadow-xl transition hover:-translate-y-0.5"
        aria-label={t('chat.openButton')}
      >
        <span className="text-base leading-none" aria-hidden="true">🧭</span>
        <span className="hidden sm:inline">{t('chat.openButton')}</span>
      </button>
    </>
  );
}

function ChatBubble({ role, text }) {
  const isBot = role === 'bot';
  return (
    <div className={`flex ${isBot ? 'justify-start' : 'justify-end'}`}>
      <div
        className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm whitespace-pre-line leading-relaxed ${
          isBot
            ? 'bg-white border border-slate-100 text-slate-700 rounded-tl-sm'
            : 'bg-brand-600 text-white rounded-tr-sm'
        }`}
      >
        {text}
      </div>
    </div>
  );
}

function TypingBubble() {
  return (
    <div className="flex justify-start">
      <div className="bg-white border border-slate-100 rounded-2xl rounded-tl-sm px-4 py-3 flex items-center gap-1">
        <span className="w-1.5 h-1.5 rounded-full bg-slate-300 animate-bounce [animation-delay:-0.3s]" />
        <span className="w-1.5 h-1.5 rounded-full bg-slate-300 animate-bounce [animation-delay:-0.15s]" />
        <span className="w-1.5 h-1.5 rounded-full bg-slate-300 animate-bounce" />
      </div>
    </div>
  );
}
