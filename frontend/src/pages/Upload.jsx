import React, { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

const API = import.meta.env.VITE_API_URL;
const SOURCE_COLORS = ['#6366f1','#0ea5e9','#10b981','#f59e0b','#ef4444','#8b5cf6','#ec4899'];

function parseTelegramJSON(raw, userName) {
  try {
    const data = JSON.parse(raw);
    const messages = data.messages || [];
    const lines = [];
    for (const msg of messages) {
      if (msg.type !== 'message') continue;
      const from = msg.from || '';
      let text = '';
      if (typeof msg.text === 'string') {
        text = msg.text;
      } else if (Array.isArray(msg.text)) {
        text = msg.text.map(t => typeof t === 'string' ? t : t.text || '').join('');
      }
      if (!text.trim()) continue;
      lines.push(`${from}: ${text}`);
    }
    return lines.join('\n');
  } catch {
    return raw; // not valid telegram JSON, return as-is
  }
}

function isTelegramJSON(name, content) {
  if (!name.endsWith('.json')) return false;
  try {
    const data = JSON.parse(content.slice(0, 500));
    return data.messages !== undefined;
  } catch { return false; }
}

export default function Upload() {
  const [sources, setSources] = useState([]);
  const [paste, setPaste] = useState('');
  const [userName, setUserName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [dragging, setDragging] = useState(false);
  const navigate = useNavigate();

  function processAndAdd(name, raw) {
    let content = raw;
    let displayName = name;
    if (isTelegramJSON(name, raw)) {
      content = parseTelegramJSON(raw, userName);
      displayName = name + ' (Telegram)';
    }
    const words = content.trim().split(/\s+/).length;
    const sizeKB = Math.round(new Blob([content]).size / 1024);
    setSources(s => [...s, {
      id: crypto.randomUUID(),
      name: displayName,
      content,
      size: sizeKB + ' KB · ' + words.toLocaleString() + ' parole',
      weight: 1,
      type: 'file'
    }]);
  }

  function addFiles(files) {
    Array.from(files).forEach(f => {
      const r = new FileReader();
      r.onload = ev => processAndAdd(f.name, ev.target.result);
      r.readAsText(f);
    });
  }

  function addPaste() {
    if (paste.trim().length < 10) return;
    const words = paste.trim().split(/\s+/).length;
    setSources(s => [...s, {
      id: crypto.randomUUID(),
      name: 'Testo incollato',
      content: paste,
      size: words.toLocaleString() + ' parole',
      weight: 1,
      type: 'paste'
    }]);
    setPaste('');
  }

  function removeSource(id) { setSources(s => s.filter(x => x.id !== id)); }
  function setWeight(id, w) { setSources(s => s.map(x => x.id === id ? { ...x, weight: parseFloat(w) } : x)); }

  const onDrop = useCallback(e => {
    e.preventDefault(); setDragging(false);
    addFiles(e.dataTransfer.files);
  }, []);

  const totalWords = sources.reduce((sum, s) => sum + s.content.trim().split(/\s+/).length, 0);
  const canAnalyze = sources.length > 0 && userName.trim().length >= 2;
  const weightLabel = w => w >= 1 ? 'Alta' : w >= 0.5 ? 'Media' : 'Bassa';

  async function analyze() {
    setLoading(true); setError('');
    try {
      const payload = sources.map(s => ({ name: s.name, content: s.content, weight: s.weight }));
      const res = await fetch(`${API}/api/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sources: payload, userName: userName.trim() })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Errore');
      localStorage.setItem('mm_session', data.sessionId);
      navigate(`/profile/${data.profileId}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f4f4f0', display: 'flex' }}>

      {/* Sidebar */}
      <div style={{
        width: sources.length > 0 ? '300px' : '0',
        minWidth: sources.length > 0 ? '300px' : '0',
        transition: 'all .3s ease', overflow: 'hidden',
        background: '#fff', borderRight: '1px solid #e8e8e4',
        display: 'flex', flexDirection: 'column'
      }}>
        {sources.length > 0 && (<>
          <div style={{ padding: '20px 20px 12px', borderBottom: '1px solid #f0f0ec' }}>
            <div style={{ fontSize: '13px', fontWeight: '600', color: '#1a1a1a' }}>Materiali caricati</div>
            <div style={{ fontSize: '11px', color: '#aaa', marginTop: '3px' }}>
              {sources.length} fonte{sources.length > 1 ? 'i' : ''} · ~{totalWords.toLocaleString()} parole totali
            </div>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '12px' }}>
            {sources.map((s, i) => (
              <div key={s.id} style={{ background: '#f9f9f7', border: '1px solid #e8e8e4', borderRadius: '10px', padding: '12px', marginBottom: '10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                  <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: SOURCE_COLORS[i % SOURCE_COLORS.length], flexShrink: 0 }} />
                  <span style={{ flex: 1, fontSize: '12px', fontWeight: '500', color: '#1a1a1a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</span>
                  <button onClick={() => removeSource(s.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ccc', fontSize: '16px', lineHeight: 1, padding: '0 2px', flexShrink: 0 }}>×</button>
                </div>
                <div style={{ fontSize: '10px', color: '#aaa', marginBottom: '8px' }}>{s.size}</div>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <span style={{ fontSize: '11px', color: '#888' }}>Importanza</span>
                    <span style={{ fontSize: '11px', fontWeight: '500', color: SOURCE_COLORS[i % SOURCE_COLORS.length] }}>{weightLabel(s.weight)}</span>
                  </div>
                  <input type="range" min="0.1" max="1" step="0.1" value={s.weight}
                    onChange={e => setWeight(s.id, e.target.value)}
                    style={{ width: '100%', accentColor: SOURCE_COLORS[i % SOURCE_COLORS.length], cursor: 'pointer' }} />
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '10px', color: '#ccc' }}>Bassa</span>
                    <span style={{ fontSize: '10px', color: '#ccc' }}>Alta</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div style={{ padding: '16px', borderTop: '1px solid #f0f0ec', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {error && <div style={{ fontSize: '12px', color: '#c0392b', background: '#fdf0ed', padding: '8px 10px', borderRadius: '6px' }}>{error}</div>}
            {!canAnalyze && userName.trim().length < 2 && (
              <div style={{ fontSize: '11px', color: '#f59e0b', textAlign: 'center' }}>Inserisci il tuo nome →</div>
            )}
            {loading
              ? <div style={{ textAlign: 'center', fontSize: '13px', color: '#888', padding: '10px' }}>Analisi in corso...</div>
              : <button onClick={analyze} disabled={!canAnalyze}
                  style={{ width: '100%', padding: '11px', background: canAnalyze ? '#1a1a1a' : '#ccc', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: '500', cursor: canAnalyze ? 'pointer' : 'not-allowed', fontFamily: 'inherit' }}>
                  Analizza →
                </button>
            }
          </div>
        </>)}
      </div>

      {/* Main */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
        <div style={{ width: '100%', maxWidth: '520px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <div style={{ fontSize: '26px', fontWeight: '700', letterSpacing: '-0.5px', color: '#1a1a1a' }}>Mirror Me</div>
            <div style={{ fontSize: '14px', color: '#888', marginTop: '4px' }}>Carica le tue chat e crea il tuo gemello digitale.</div>
          </div>

          {/* Username */}
          <div style={{ background: '#fff', borderRadius: '12px', border: `1px solid ${userName.trim().length >= 2 ? '#e8e8e4' : '#f59e0b'}`, padding: '16px' }}>
            <div style={{ fontSize: '12px', fontWeight: '600', color: '#1a1a1a', marginBottom: '4px' }}>
              Come ti chiami nelle chat? <span style={{ color: '#ef4444' }}>*</span>
            </div>
            <div style={{ fontSize: '11px', color: '#aaa', marginBottom: '8px' }}>
              Il nome con cui appari nei messaggi — es. "Giorgio", "+39 333...", "g.fadda"
            </div>
            <input value={userName} onChange={e => setUserName(e.target.value)}
              placeholder="Es. Giorgio"
              style={{ width: '100%', padding: '9px 12px', fontSize: '13px', background: '#f9f9f7', border: '1px solid #e8e8e4', borderRadius: '8px', color: '#1a1a1a', outline: 'none', fontFamily: 'inherit' }} />
          </div>

          {/* Dropzone */}
          <div onDragOver={e => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={onDrop}
            onClick={() => document.getElementById('fi').click()}
            style={{ border: `2px dashed ${dragging ? '#6366f1' : '#d0d0c8'}`, borderRadius: '14px', padding: '28px', textAlign: 'center', cursor: 'pointer', background: dragging ? '#f0f0ff' : '#fff', transition: 'all .15s' }}>
            <div style={{ fontSize: '28px', marginBottom: '8px' }}>↑</div>
            <div style={{ fontSize: '14px', color: '#555', fontWeight: '500' }}>{sources.length > 0 ? 'Aggiungi altre fonti' : 'Carica file'}</div>
            <div style={{ fontSize: '12px', color: '#aaa', marginTop: '4px' }}>.txt · .json Telegram · trascina o clicca</div>
            <input type="file" id="fi" multiple accept=".txt,.json,.csv" style={{ display: 'none' }} onChange={e => addFiles(e.target.files)} />
          </div>

          {/* Paste */}
          <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e8e8e4', padding: '16px' }}>
            <div style={{ fontSize: '12px', color: '#888', fontWeight: '500', marginBottom: '8px' }}>Incolla testo</div>
            <textarea value={paste} onChange={e => setPaste(e.target.value)} placeholder="Messaggi, note, email..."
              style={{ width: '100%', height: '80px', padding: '8px 10px', fontSize: '13px', background: '#f9f9f7', border: '1px solid #e8e8e4', borderRadius: '8px', resize: 'vertical', color: '#1a1a1a', outline: 'none', fontFamily: 'inherit' }} />
            <button onClick={addPaste} disabled={paste.trim().length < 10}
              style={{ marginTop: '8px', padding: '7px 16px', background: paste.trim().length >= 10 ? '#1a1a1a' : '#f0f0ec', color: paste.trim().length >= 10 ? '#fff' : '#aaa', border: 'none', borderRadius: '6px', fontSize: '12px', cursor: paste.trim().length >= 10 ? 'pointer' : 'not-allowed', fontFamily: 'inherit' }}>
              + Aggiungi come fonte
            </button>
          </div>

          {sources.length === 0 && <div style={{ fontSize: '12px', color: '#aaa', textAlign: 'center' }}>Carica almeno una fonte per iniziare</div>}
        </div>
      </div>
    </div>
  );
}
