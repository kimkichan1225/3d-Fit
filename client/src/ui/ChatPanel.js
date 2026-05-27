import { useEffect, useRef, useState } from 'react';

export function ChatPanel({ messages, onSend, myNickname }) {
  const [draft, setDraft] = useState('');
  const [open, setOpen] = useState(true);
  const listRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages, open]);

  // 전역 Enter로 채팅 입력 포커스
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'Enter') return;
      const el = document.activeElement;
      const inForm = el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA');
      if (inForm) return;
      setOpen(true);
      // 다음 프레임에 포커스
      requestAnimationFrame(() => inputRef.current?.focus());
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const submit = (e) => {
    e.preventDefault();
    const t = draft.trim();
    if (!t) return;
    onSend(t);
    setDraft('');
  };

  return (
    <div style={open ? container : containerCollapsed}>
      <div style={header} onClick={() => setOpen((v) => !v)}>
        <span>채팅</span>
        <span style={{ opacity: 0.6, fontSize: 12 }}>{open ? '▾' : '▴'}</span>
      </div>
      {open && (
        <>
          <div ref={listRef} style={list}>
            {messages.map((m, i) => (
              <div key={i} style={m.type === 'system' ? systemRow : row}>
                {m.type === 'system' ? (
                  <span style={systemText}>{m.message}</span>
                ) : (
                  <>
                    <span style={{ ...nick, color: m.nickname === myNickname ? '#a8d4ff' : '#ffd9a8' }}>
                      {m.nickname}
                    </span>
                    <span style={text}>{m.message}</span>
                  </>
                )}
              </div>
            ))}
          </div>
          <form onSubmit={submit} style={form}>
            <input
              ref={inputRef}
              style={input}
              placeholder="메시지 입력 (Enter)"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              maxLength={200}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  e.currentTarget.blur();
                }
              }}
            />
            <button type="submit" style={sendBtn} disabled={!draft.trim()}>
              보내기
            </button>
          </form>
        </>
      )}
    </div>
  );
}

const container = {
  position: 'fixed',
  left: 16,
  bottom: 16,
  width: 360,
  maxHeight: 360,
  display: 'flex',
  flexDirection: 'column',
  borderRadius: 14,
  background: 'rgba(10, 12, 30, 0.78)',
  border: '1px solid rgba(255,255,255,0.1)',
  backdropFilter: 'blur(14px)',
  color: '#fff',
  zIndex: 50,
  overflow: 'hidden',
};

const containerCollapsed = { ...container, maxHeight: 40 };

const header = {
  padding: '10px 14px',
  fontSize: 13,
  fontWeight: 600,
  display: 'flex',
  justifyContent: 'space-between',
  cursor: 'pointer',
  borderBottom: '1px solid rgba(255,255,255,0.08)',
};

const list = {
  flex: 1,
  overflowY: 'auto',
  padding: '8px 12px',
  fontSize: 13,
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
};

const row = { display: 'flex', gap: 6, alignItems: 'baseline' };
const systemRow = { display: 'flex', justifyContent: 'center' };
const nick = { fontWeight: 700, minWidth: 'fit-content' };
const text = { color: 'rgba(255,255,255,0.9)', wordBreak: 'break-word' };
const systemText = { color: 'rgba(255,255,255,0.5)', fontSize: 12, fontStyle: 'italic' };

const form = {
  display: 'flex',
  padding: 8,
  gap: 6,
  borderTop: '1px solid rgba(255,255,255,0.08)',
};

const input = {
  flex: 1,
  padding: '8px 12px',
  borderRadius: 8,
  border: '1px solid rgba(255,255,255,0.15)',
  background: 'rgba(255,255,255,0.06)',
  color: '#fff',
  fontSize: 13,
  outline: 'none',
};

const sendBtn = {
  padding: '0 14px',
  borderRadius: 8,
  border: 'none',
  background: 'linear-gradient(135deg, #5b8def, #8a5bef)',
  color: '#fff',
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
};
