import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';

const API = import.meta.env.VITE_API_URL;
function gemColor(n) { return n >= 70 ? '#1D9E75' : n >= 50 ? '#BA7517' : '#C0392B'; }

export default function Chat() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [profile, setProfile] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [gem, setGem] = useState(0);
  const [isLearning, setIsLearning] = useState(false);
  const msgsRef = useRef(null);

  useEffect(() => {
    fetch(`${API}/api/profile/${id}`)
      .then(r => r.json())
      .then(data => {
        setProfile(data);
        setGem(data.gemellaggio);
        const p = data.profile_json;
        setMessages([{
          role: 'assistant',
          content: `Ciao! Sono il tuo gemello digitale. Dimmi qualcosa.`,
          isFirst: true
        }]);
      });
  }, [id]);

  useEffect(() => {
    if (msgsRef.current) msgsRef.current.scrollTop = msgsRef.current.scrollHeight;
  }, [messages]);

  const canLearn = () => {
    if (!profile) return false;
    const diff = Date.now() - new Date(profile.last_learned_at).getTime();
    return diff > 23 * 60 * 60 * 1000 && messages.length > 4;
  };

  async function send() {
    if (!input.trim() || loading) return;
    const text = input.trim();
    setInput('');
    const history = messages.filter(m => !m.isFirst && !m.isSystem && m.content);
    setMessages(m => [...m, { role: 'user', content: text }]);
    setLoading(true);

    try {
      const res = await fetch(`${API}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profileId: id, message: text, history })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      // Update gemellaggio if changed
      if (data.gemellaggio && data.gemellaggio !== gem) setGem(data.gemellaggio);

      // Add reply
      setMessages(m => [...m, {
        role: 'assistant',
        content: data.reply,
        turns: Math.floor((data.totalMessages || 2) / 2)
      }]);

      // Show learned facts as system messages
      if (data.newFacts && data.newFacts.length > 0) {
        setMessages(m => [...m, {
          role: 'system',
          isSystem: true,
          content: `Ricordato: ${data.newFacts.join(' · ')}`
        }]);
      }

      // Show learning notification
      if (data.learnedSomething) {
        setMessages(m => [...m, {
          role: 'system',
          isSystem: true,
          content: `Gemello aggiornato — gemellaggio ${data.gemellaggio}%`
        }]);
      }

    } catch (err) {
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
        setMessages(m => [...m, {
          role: 'system', isSystem: true,
          content: `Gemello aggiornato — gemellaggio salito a ${data.gemellaggio}%`
        }]);
      }
    } catch {}
    finally { setIsLearning(false); }
  }

  if (!profile) return <div style={{ textAlign: 'center', padding: '60px', color: '#aaa' }}>Caricamento...</div>;

  const p = profile.profile_json;
  const col = gemColor(gem);

  const dotAnim = `@keyframes bop{0%,60%,100%{transform:translateY(0)}30%{transform:translateY(-4px)}}`;

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: '#f9f9f7' }}>
      <style>{dotAnim}</style>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 16px', background: '#fff', borderBottom: '1px solid #e8e8e4', flexShrink: 0 }}>
        <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: '#f0f0ec', border: '1px solid #e8e8e4', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', fontWeight: '600', color: '#555', flexShrink: 0 }}>
          {p.initials}
        </div>
        <div>
          <div style={{ fontSize: '14px', fontWeight: '600' }}>{p.name}</div>
          <div style={{ fontSize: '11px', color: '#aaa' }}>gemello digitale</div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '8px' }}>
          {canLearn() && (
            <button onClick={learn} disabled={isLearning}
              style={{ padding: '5px 12px', background: 'none', border: '1px solid #d0d0c8', borderRadius: '6px', fontSize: '12px', cursor: 'pointer', color: '#555', fontFamily: 'inherit' }}>
              {isLearning ? '...' : '↻ Aggiorna'}
            </button>
          )}
          <div onClick={() => navigate(`/profile/${id}`)}
            style={{ padding: '3px 10px', background: '#f5f5f2', border: '1px solid #e8e8e4', borderRadius: '20px', fontSize: '11px', color: col, cursor: 'pointer', fontWeight: '500' }}>
            {gem}% match
          </div>
        </div>
      </div>

      {/* Messages */}
      <div ref={msgsRef} style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {messages.map((m, i) => {
          if (m.isSystem) return (
            <div key={i} style={{ alignSelf: 'center', padding: '5px 14px', background: '#edf7f2', border: '1px solid #9FE1CB', borderRadius: '20px', fontSize: '11px', color: '#0F6E56' }}>
              {m.content}
            </div>
          );
          if (m.role === 'user') return (
            <div key={i} style={{ alignSelf: 'flex-end', maxWidth: '78%' }}>
              <div style={{ fontSize: '10px', color: '#aaa', marginBottom: '3px', textAlign: 'right' }}>tu</div>
              <div style={{ padding: '9px 13px', background: '#1a1a1a', color: '#fff', borderRadius: '14px 14px 4px 14px', fontSize: '13px', lineHeight: '1.5' }}>{m.content}</div>
            </div>
          );
          return (
            <div key={i} style={{ alignSelf: 'flex-start', maxWidth: '78%' }}>
              <div style={{ fontSize: '10px', color: '#aaa', marginBottom: '3px' }}>{p.name}</div>
              <div style={{ padding: '9px 13px', background: '#fff', color: '#1a1a1a', border: '1px solid #e8e8e4', borderRadius: '14px 14px 14px 4px', fontSize: '13px', lineHeight: '1.5' }}>{m.content}</div>
              {m.turns && (
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', padding: '2px 8px', background: '#f5f5f2', border: '1px solid #e8e8e4', borderRadius: '20px', fontSize: '10px', color: '#aaa', marginTop: '4px' }}>
                  ⬡ {m.turns} scambi in memoria
                </div>
              )}
            </div>
          );
        })}
        {loading && (
          <div style={{ alignSelf: 'flex-start' }}>
            <div style={{ fontSize: '10px', color: '#aaa', marginBottom: '3px' }}>{p.name}</div>
            <div style={{ padding: '9px 13px', background: '#fff', border: '1px solid #e8e8e4', borderRadius: '14px 14px 14px 4px', display: 'flex', gap: '4px', alignItems: 'center' }}>
              {[0, 0.2, 0.4].map((d, i) => (
                <div key={i} style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#aaa', animation: `bop 1.2s ${d}s infinite` }} />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div style={{ display: 'flex', gap: '8px', padding: '12px 16px', background: '#fff', borderTop: '1px solid #e8e8e4', flexShrink: 0 }}>
        <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && send()}
          placeholder="Scrivi qualcosa..."
          style={{ flex: 1, padding: '9px 13px', fontSize: '13px', background: '#f9f9f7', border: '1px solid #e8e8e4', borderRadius: '8px', color: '#1a1a1a', outline: 'none', fontFamily: 'inherit' }} />
        <button onClick={send} disabled={loading}
          style={{ padding: '9px 16px', background: '#1a1a1a', color: '#fff', border: 'none', borderRadius: '8px', cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.4 : 1, fontSize: '14px' }}>→</button>
      </div>
    </div>
  );
}
