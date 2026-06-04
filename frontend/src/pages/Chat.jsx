import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';

const API = import.meta.env.VITE_API_URL;

function gemColor(n) { return n >= 70 ? '#1D9E75' : n >= 50 ? '#BA7517' : '#C0392B'; }

const s = {
  page: { height: '100vh', display: 'flex', flexDirection: 'column', background: '#f9f9f7' },
  header: { display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 16px', background: '#fff', borderBottom: '1px solid #e8e8e4', flexShrink: 0 },
  avatar: { width: '36px', height: '36px', borderRadius: '50%', background: '#f0f0ec', border: '1px solid #e8e8e4', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', fontWeight: '600', color: '#555', flexShrink: 0 },
  name: { fontSize: '14px', fontWeight: '600' },
  sub: { fontSize: '11px', color: '#aaa' },
  badge: { marginLeft: 'auto', padding: '3px 10px', background: '#f5f5f2', border: '1px solid #e8e8e4', borderRadius: '20px', fontSize: '11px', color: '#888', cursor: 'pointer' },
  msgs: { flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: '10px' },
  msgU: { alignSelf: 'flex-end', maxWidth: '78%' },
  msgB: { alignSelf: 'flex-start', maxWidth: '78%' },
  lbl: { fontSize: '10px', color: '#aaa', marginBottom: '3px' },
  lblR: { fontSize: '10px', color: '#aaa', marginBottom: '3px', textAlign: 'right' },
  bubU: { padding: '9px 13px', background: '#1a1a1a', color: '#fff', borderRadius: '14px 14px 4px 14px', fontSize: '13px', lineHeight: '1.5' },
  bubB: { padding: '9px 13px', background: '#fff', color: '#1a1a1a', border: '1px solid #e8e8e4', borderRadius: '14px 14px 14px 4px', fontSize: '13px', lineHeight: '1.5' },
  mem: { display: 'inline-flex', alignItems: 'center', gap: '3px', padding: '2px 8px', background: '#f5f5f2', border: '1px solid #e8e8e4', borderRadius: '20px', fontSize: '10px', color: '#aaa', marginTop: '4px' },
  learned: { alignSelf: 'center', padding: '6px 14px', background: '#edf7f2', border: '1px solid #9FE1CB', borderRadius: '20px', fontSize: '12px', color: '#0F6E56' },
  dots: { display: 'flex', gap: '4px', alignItems: 'center', padding: '9px 13px', background: '#fff', border: '1px solid #e8e8e4', borderRadius: '14px 14px 14px 4px', width: 'fit-content' },
  dot: { width: '5px', height: '5px', borderRadius: '50%', background: '#aaa' },
  ir: { display: 'flex', gap: '8px', padding: '12px 16px', background: '#fff', borderTop: '1px solid #e8e8e4', flexShrink: 0 },
  input: { flex: 1, padding: '9px 13px', fontSize: '13px', background: '#f9f9f7', border: '1px solid #e8e8e4', borderRadius: '8px', color: '#1a1a1a', outline: 'none', fontFamily: 'inherit' },
  sendBtn: { padding: '9px 16px', background: '#1a1a1a', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '14px' },
  learnBtn: { padding: '6px 12px', background: 'none', border: '1px solid #d0d0c8', borderRadius: '6px', fontSize: '12px', cursor: 'pointer', color: '#555', fontFamily: 'inherit' }
};

const dotAnim = `@keyframes bop{0%,60%,100%{transform:translateY(0)}30%{transform:translateY(-4px)}}`;

export default function Chat() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [profile, setProfile] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [gem, setGem] = useState(0);
  const [lastLearned, setLastLearned] = useState(null);
  const [isLearning, setIsLearning] = useState(false);
  const msgsRef = useRef(null);

  useEffect(() => {
    fetch(`${API}/api/profile/${id}`)
      .then(r => r.json())
      .then(data => {
        setProfile(data);
        setGem(data.gemellaggio);
        setLastLearned(data.last_learned_at);
        const p = data.profile_json;
        setMessages([{
          role: 'assistant',
          content: `Ciao! Sono il tuo gemello digitale. Dimmi qualcosa — vediamo quanto ti conosco.`,
          isFirst: true
        }]);
      });
  }, [id]);

  useEffect(() => {
    if (msgsRef.current) msgsRef.current.scrollTop = msgsRef.current.scrollHeight;
  }, [messages]);

  const canLearn = () => {
    if (!lastLearned) return true;
    const diff = Date.now() - new Date(lastLearned).getTime();
    return diff > 23 * 60 * 60 * 1000;
  };

  async function send() {
    if (!input.trim() || loading) return;
    const text = input.trim();
    setInput('');
   const history = messages.filter(m => !m.isFirst && !m.isLearned && m.content && m.content.trim().length > 0);
    setMessages(m => [...m, { role: 'user', content: text }]);
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profileId: id, message: text, history })
      });
      const data = await res.json();
      setMessages(m => [...m, { role: 'assistant', content: data.reply, turns: Math.floor((data.totalMessages || 2) / 2) }]);
    } catch {
      setMessages(m => [...m, { role: 'assistant', content: 'Errore. Riprova.' }]);
    } finally {
      setLoading(false);
    }
  }

  async function learn() {
    setIsLearning(true);
    try {
      const res = await fetch(`${API}/api/chat/learn`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profileId: id })
      });
      const data = await res.json();
      if (data.updated) {
        setGem(data.gemellaggio);
        setLastLearned(new Date().toISOString());
        setMessages(m => [...m, {
          role: 'system',
          isLearned: true,
          content: `Gemello aggiornato — gemellaggio salito a ${data.gemellaggio}%`
        }]);
      } else {
        setMessages(m => [...m, { role: 'system', isLearned: true, content: data.reason || 'Nessun aggiornamento necessario.' }]);
      }
    } catch {
      // silently fail
    } finally {
      setIsLearning(false);
    }
  }

  if (!profile) return <div style={{ textAlign: 'center', padding: '60px', color: '#aaa' }}>Caricamento...</div>;

  const p = profile.profile_json;
  const col = gemColor(gem);

  return (
    <div style={s.page}>
      <style>{dotAnim}</style>
      <div style={s.header}>
        <div style={s.avatar}>{p.initials}</div>
        <div>
          <div style={s.name}>{p.name}</div>
          <div style={s.sub}>il tuo alter ego</div>
        </div>
        <div style={{ ...s.badge, color: col }} onClick={() => navigate(`/profile/${id}`)}>
          {gem}% match
        </div>
        {canLearn() && messages.length > 4 && (
          <button style={s.learnBtn} onClick={learn} disabled={isLearning}>
            {isLearning ? 'Impara...' : '↻ Aggiorna'}
          </button>
        )}
      </div>

      <div style={s.msgs} ref={msgsRef}>
        {messages.map((m, i) => {
          if (m.isLearned) return (
            <div key={i} style={s.learned}>{m.content}</div>
          );
          if (m.role === 'user') return (
            <div key={i} style={s.msgU}>
              <div style={s.lblR}>tu</div>
              <div style={s.bubU}>{m.content}</div>
            </div>
          );
          return (
            <div key={i} style={s.msgB}>
              <div style={s.lbl}>{p.name}</div>
              <div style={s.bubB}>{m.content}</div>
              {m.turns && <div style={s.mem}>⬡ {m.turns} scambi in memoria</div>}
            </div>
          );
        })}
        {loading && (
          <div style={s.msgB}>
            <div style={s.lbl}>{p.name}</div>
            <div style={s.dots}>
              {[0, 0.2, 0.4].map((d, i) => (
                <div key={i} style={{ ...s.dot, animation: `bop 1.2s ${d}s infinite` }} />
              ))}
            </div>
          </div>
        )}
      </div>

      <div style={s.ir}>
        <input
          style={s.input}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && send()}
          placeholder="Scrivi qualcosa..."
        />
        <button style={{ ...s.sendBtn, opacity: loading ? 0.4 : 1 }} onClick={send} disabled={loading}>→</button>
      </div>
    </div>
  );
}
