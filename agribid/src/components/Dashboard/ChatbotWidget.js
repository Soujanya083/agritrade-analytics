import React, { useState, useRef, useEffect } from 'react';

const ANALYTICS_BASE = process.env.REACT_APP_ANALYTICS_BASE_URL || 'http://localhost:8000/api/analytics';

const SUGGESTIONS = [
  'What will wheat price be next week?',
  'Which crop has higher demand in Pune?',
  'What are the best-selling crops?',
  "What's the demand for onion?",
];

const bubbleBase = {
  padding: '10px 14px',
  borderRadius: '14px',
  maxWidth: '80%',
  fontSize: '14px',
  lineHeight: '1.4',
  whiteSpace: 'pre-wrap',
};

const ChatbotWidget = () => {
  const [messages, setMessages] = useState([
    { role: 'bot', text: "Hi! I'm your AgriTrade assistant. Ask me about crop prices, demand, or recommendations." },
  ]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const scrollRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const sendMessage = async (text) => {
    const trimmed = text.trim();
    if (!trimmed || sending) return;

    setMessages((prev) => [...prev, { role: 'user', text: trimmed }]);
    setInput('');
    setSending(true);

    try {
      const res = await fetch(`${ANALYTICS_BASE}/chatbot`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: trimmed }),
      });
      const data = await res.json();
      setMessages((prev) => [...prev, { role: 'bot', text: data.reply || 'Sorry, something went wrong.' }]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { role: 'bot', text: 'Could not reach the assistant. Is the analytics service running on port 8000?' },
      ]);
    } finally {
      setSending(false);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    sendMessage(input);
  };

  return (
    <div style={{ background: '#fff', borderRadius: '12px', padding: '16px' }}>
      <h3>AI Assistant</h3>
      <p style={{ fontSize: '13px', color: '#666', marginBottom: '10px' }}>
        Ask about crop prices, demand, or what to sell — answers come straight from the ML models above.
      </p>

      <div
        ref={scrollRef}
        style={{
          height: '260px',
          overflowY: 'auto',
          background: '#f7f7f7',
          borderRadius: '10px',
          padding: '12px',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          marginBottom: '10px',
        }}
      >
        {messages.map((m, i) => (
          <div
            key={i}
            style={{
              ...bubbleBase,
              alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
              background: m.role === 'user' ? '#2e7d32' : '#fff',
              color: m.role === 'user' ? '#fff' : '#222',
              border: m.role === 'user' ? 'none' : '1px solid #e0e0e0',
            }}
          >
            {m.text}
          </div>
        ))}
        {sending && (
          <div style={{ ...bubbleBase, alignSelf: 'flex-start', background: '#fff', border: '1px solid #e0e0e0', color: '#999' }}>
            Thinking...
          </div>
        )}
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '10px' }}>
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => sendMessage(s)}
            style={{
              fontSize: '12px',
              padding: '6px 10px',
              borderRadius: '999px',
              border: '1px solid #d0d0d0',
              background: '#fafafa',
              cursor: 'pointer',
            }}
          >
            {s}
          </button>
        ))}
      </div>

      <form onSubmit={handleSubmit} style={{ display: 'flex', gap: '8px' }}>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask a question..."
          style={{ flex: 1, padding: '10px 12px', borderRadius: '8px', border: '1px solid #ccc' }}
        />
        <button
          type="submit"
          disabled={sending}
          style={{
            padding: '10px 18px',
            borderRadius: '8px',
            border: 'none',
            background: '#2e7d32',
            color: '#fff',
            cursor: sending ? 'not-allowed' : 'pointer',
          }}
        >
          Send
        </button>
      </form>
    </div>
  );
};

export default ChatbotWidget;
