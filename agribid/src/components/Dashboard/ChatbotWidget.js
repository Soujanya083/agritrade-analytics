import React, { useState, useRef, useEffect } from 'react';
import { analytics, AnalyticsError, describeError } from '../../api/analyticsClient';

const SUGGESTIONS = [
  'What will wheat price be next week?',
  'Should I sell onion now or wait?',
  'Which crop has higher demand in Pune?',
  'How do I control aphids on mustard?',
];

// Where an answer came from. Shown on every bot message so a farmer can tell
// "numbers from your marketplace data" apart from "general AI advice".
export const SOURCE_BADGE = {
  project_data: { label: '📊 From marketplace data', bg: '#e8f5e9', color: '#1b5e20' },
  llm_general: { label: '🤖 General AI answer - not from your data', bg: '#fff3e0', color: '#b45309' },
  fallback: { label: 'ℹ️ Assistant note', bg: '#eceff1', color: '#455a64' },
};

const bubbleBase = {
  padding: '10px 14px', borderRadius: '14px', maxWidth: '85%', fontSize: '14px', lineHeight: '1.4', whiteSpace: 'pre-wrap',
};

// Turns the API result into a chat message. Exported so it can be unit tested.
export function toBotMessage(data) {
  return {
    role: 'bot',
    text: data.reply || 'Sorry, I could not produce an answer.',
    source: data.source || 'fallback',
    disclaimer: data.disclaimer || null,
  };
}

export function toErrorMessage(err) {
  if (err instanceof AnalyticsError && err.status === 429) {
    return { role: 'bot', text: 'You have asked a lot of general questions in a short time. Please wait a few minutes. Questions about prices and demand still work.', source: 'fallback' };
  }
  return { role: 'bot', text: describeError(err), source: 'fallback' };
}

const ChatbotWidget = () => {
  const [messages, setMessages] = useState([
    {
      role: 'bot',
      source: 'fallback',
      text: "Hi! I'm your AgriTrade assistant. Ask me about prices, demand and where to sell - answered from this marketplace's data - or a general farming question.",
    },
  ]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [llmOn, setLlmOn] = useState(null);
  const scrollRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  useEffect(() => {
    let alive = true;
    analytics.get('/chatbot/status').then((s) => { if (alive) setLlmOn(Boolean(s.llm && s.llm.configured)); }).catch(() => {});
    return () => { alive = false; };
  }, []);

  const sendMessage = async (text) => {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    setMessages((prev) => [...prev, { role: 'user', text: trimmed }]);
    setInput('');
    setSending(true);
    try {
      const data = await analytics.post('/chatbot', { message: trimmed });
      setMessages((prev) => [...prev, toBotMessage(data)]);
    } catch (err) {
      setMessages((prev) => [...prev, toErrorMessage(err)]);
    } finally {
      setSending(false);
    }
  };

  return (
    <div style={{ background: '#fff', borderRadius: '12px', padding: '16px' }}>
      <h3 style={{ marginTop: 0 }}>AI Assistant</h3>
      <p style={{ fontSize: '13px', color: '#666', marginBottom: '10px' }}>
        Price and demand answers come from the models on this page. General farming answers
        {llmOn === false ? ' are switched off on this server (no AI key configured).' : ' come from a general AI model and are labelled as such.'}
      </p>
      <div
        ref={scrollRef}
        aria-live="polite"
        style={{ height: '280px', overflowY: 'auto', background: '#f7f7f7', borderRadius: '10px', padding: '12px', display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '10px' }}
      >
        {messages.map((m, i) => {
          const badge = m.role === 'bot' ? SOURCE_BADGE[m.source] : null;
          return (
            // eslint-disable-next-line react/no-array-index-key
            <div key={i} style={{ alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '85%' }}>
              <div
                style={{
                  ...bubbleBase,
                  maxWidth: '100%',
                  background: m.role === 'user' ? '#2e7d32' : '#fff',
                  color: m.role === 'user' ? '#fff' : '#222',
                  border: m.role === 'user' ? 'none' : '1px solid #e0e0e0',
                }}
              >
                {m.text}
              </div>
              {badge && (
                <span style={{ display: 'inline-block', marginTop: '4px', fontSize: '11px', padding: '2px 8px', borderRadius: '999px', background: badge.bg, color: badge.color }}>
                  {badge.label}
                </span>
              )}
              {m.disclaimer && <div style={{ fontSize: '11px', color: '#888', marginTop: '3px' }}>{m.disclaimer}</div>}
            </div>
          );
        })}
        {sending && <div style={{ ...bubbleBase, alignSelf: 'flex-start', background: '#fff', border: '1px solid #e0e0e0', color: '#888' }}>Thinking...</div>}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '10px' }}>
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => sendMessage(s)}
            style={{ fontSize: '12px', padding: '6px 10px', borderRadius: '999px', border: '1px solid #d0d0d0', background: '#fafafa', cursor: 'pointer' }}
          >
            {s}
          </button>
        ))}
      </div>
      <form onSubmit={(e) => { e.preventDefault(); sendMessage(input); }} style={{ display: 'flex', gap: '8px' }}>
        <input
          type="text"
          value={input}
          maxLength={500}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask a question..."
          aria-label="Ask the assistant"
          style={{ flex: 1, padding: '10px 12px', borderRadius: '8px', border: '1px solid #ccc', fontSize: '14px' }}
        />
        <button
          type="submit"
          disabled={sending || !input.trim()}
          style={{ padding: '10px 18px', borderRadius: '8px', border: 'none', background: '#2e7d32', color: '#fff', cursor: sending ? 'not-allowed' : 'pointer', opacity: sending || !input.trim() ? 0.6 : 1 }}
        >
          Send
        </button>
      </form>
    </div>
  );
};

export default ChatbotWidget;
