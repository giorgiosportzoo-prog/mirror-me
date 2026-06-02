import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

const API = import.meta.env.VITE_API_URL;

const s = {
  page: { minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px' },
  card: { width: '100%', maxWidth: '560px', background: '#fff', borderRadius: '16px', border: '1px solid #e8e8e4', padding: '32px', display: 'flex', flexDirection: 'column', gap: '20px' },
  logo: { fontSize: '22px', fontWeight: '600', letterSpacing: '-0.5px', marginBottom: '4px' },
  sub: { fontSize: '14px', color: '#888', lineHeight: '1.5' },
  label: { fontSize: '12px', color: '#666', display: 'block', marginBottom: '6px', fontWeight: '500' },
  dz: { border: '1.5px dashed #d0d0c8', borderRadius: '12px', padding: '24px', textAlign: 'center', cursor: 'pointer', transition: 'background .15s' },
  dzIcon: { fontSize: '28px', marginBottom: '8px', color: '#999' },
  dzText: { fontSize: '13px', color: '#777' },
  dzSub: { fontSize: '11px', color: '#aaa', marginTop: '3px', display: 'block' },
  ta: { width: '100%', height: '120px', padding: '10px 12px', fontSize: '13px', background: '#f9f9f7', border: '1px solid #e8e8e4', borderRadius: '8px', resize: 'vertical', color: '#1a1a1a', outline: 'none', fontFamily: 'inherit' },
  docs: { display: 'flex', flexDirection: 'column', gap: '6px' },
  doc: { display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', background: '#f9f9f7', borderRadius: '8px', border: '1px solid #e8e8e4', fontSize: '13px' },
  docName: { flex: 1, color: '#1a1a1a' },
  docSz: { fontSize: '11px', color: '#aaa' },
  docRm: { background: 'none', border: 'none', cursor: 'pointer', color: '#aaa', fontSize: '16px', lineHeight: 1 },
  btn: { width: '100%', padding: '11px', background: '#1a1a1a', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: '500', cursor: 'pointer', transition: 'opacity .15s', fontFamily: 'inherit' },
  err: { fontSize: '13px', color: '#c0392b', background: '#fdf0ed', padding: '10px 12px', borderRadius: '8px' },
  loading: { textAlign: 'center', fontSize: '13px', color: '#888', padding: '8px 0' }
};

export default function Upload() {
  const [docs, setDocs] = useState([]);
  const [paste, setPaste] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  function addFiles(e) {
    Array.from(e.target.files).forEach(f => {
      const r = new FileReader();
      r.onload = ev => setDocs(d => [...d, { name: f.name, content: ev.target.result, size: Math.round(f.size / 1024) + 'KB' }]);
      r.readAsText(f);
    });
  }

  function rmDoc(i) { setDocs(d => d.filter((_, idx) => idx !== i)); }

  const canAnalyze = docs.length > 0 || paste.trim().length >= 30;

  async function analyze() {
    setLoading(true); setError('');
    let text = paste;
    docs.forEach(d => text += '\n\n' + d.content);
    try {
      const res = await fetch(`${API}/api/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: text.slice(0, 50000) })
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
    <div style={s.page}>
      <div style={s.card}>
        <div>
          <div style={s.logo}>Mirror Me</div>
          <div style={s.sub}>Carica le tue chat o testi e crea il tuo gemello digitale.</div>
        </div>

        <div>
          <span style={s.label}>Carica file (.txt, .json, .csv)</span>
          <div style={s.dz} onClick={() => document.getElementById('fi').click()}>
            <div style={s.dzIcon}>↑</div>
            <div style={s.dzText}>Clicca per caricare</div>
            <span style={s.dzSub}>Chat WhatsApp/Telegram esportate, note, email...</span>
          </div>
          <input type="file" id="fi" multiple accept=".txt,.json,.csv" style={{ display: 'none' }} onChange={addFiles} />
        </div>

        {docs.length > 0 && (
          <div style={s.docs}>
            {docs.map((d, i) => (
              <div key={i} style={s.doc}>
                <span style={s.docName}>{d.name}</span>
                <span style={s.docSz}>{d.size}</span>
                <button style={s.docRm} onClick={() => rmDoc(i)}>×</button>
              </div>
            ))}
          </div>
        )}

        <div>
          <span style={s.label}>Oppure incolla testo direttamente</span>
          <textarea
            style={s.ta}
            value={paste}
            onChange={e => setPaste(e.target.value)}
            placeholder="Messaggi, diari, note... Più materiale dai, più alto sarà il gemellaggio."
          />
        </div>

        {error && <div style={s.err}>{error}</div>}

        {loading
          ? <div style={s.loading}>Analisi in corso...</div>
          : <button style={{ ...s.btn, opacity: canAnalyze ? 1 : 0.4, cursor: canAnalyze ? 'pointer' : 'not-allowed' }}
              onClick={analyze} disabled={!canAnalyze}>
              Analizza e calcola gemellaggio →
            </button>
        }
      </div>
    </div>
  );
}
