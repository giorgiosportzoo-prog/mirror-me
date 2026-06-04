import React, { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

const API = import.meta.env.VITE_API_URL;

const SOURCE_COLORS = ['#6366f1','#0ea5e9','#10b981','#f59e0b','#ef4444','#8b5cf6','#ec4899'];

export default function Upload() {
  const [sources, setSources] = useState([]); // {id, name, content, size, weight, type}
  const [paste, setPaste] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [dragging, setDragging] = useState(false);
  const navigate = useNavigate();

  function addFiles(files) {
    Array.from(files).forEach(f => {
      const r = new FileReader();
      r.onload = ev => {
        setSources(s => [...s, {
          id: crypto.randomUUID(),
          name: f.name,
          content: ev.target.result,
          size: Math.round(f.size / 1024) + ' KB',
          weight: 1,
          type: 'file'
        }]);
      };
      r.readAsText(f);
    });
  }

  function addPaste() {
    if (paste.trim().length < 10) return;
    setSources(s => [...s, {
      id: crypto.randomUUID(),
      name: 'Testo incollato',
      content: paste,
      size: paste.length + ' chars',
      weight: 1,
      type: 'paste'
    }]);
    setPaste('');
  }

  function removeSource(id) {
    setSources(s => s.filter(x => x.id !== id));
  }

  function setWeight(id, w) {
    setSources(s => s.map(x => x.id === id ? { ...x, weight: parseFloat(w) } : x));
  }

  const onDrop = useCallback(e => {
    e.preventDefault();
    setDragging(false);
    addFiles(e.dataTransfer.files);
  }, []);

  const canAnalyze = sources.length > 0;
  const totalWords = sources.reduce((sum, s) => sum + s.content.trim().split(/\s+/).length, 0);

  async function analyze() {
    setLoading(true); setError('');
    try {
      const payload = sources.map(s => ({
        name: s.name,
        content: s.content,
        weight: s.weight
      }));

      const res = await fetch(`${API}/api/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sources: payload })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Errore');
      localStorage.setItem('mm_session', data.sessionId);
      localStorage.setItem('mm_sources', JSON.stringify(sources.map(s => ({ id: s.id, name: s.name, size: s.size, weight: s.weight }))));
      navigate(`/profile/${data.profileId}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  const weightLabel = w => w >= 1 ? 'Alta' : w >= 0.5 ? 'Media' : 'Bassa';

  return (
    <div style={{ minHeight: '100vh', background: '#f4f4f0', display: 'flex' }}>

      {/* Sidebar */}
      <div style={{
        width: sources.length > 0 ? '320px' : '0',
        minWidth: sources.length > 0 ? '320px' : '0',
        transition: 'all .3s ease',
        overflow: 'hidden',
        background: '#fff',
        borderRight: '1px solid #e8e8e4',
        display: 'flex',
        flexDirection: 'column'
      }}>
        {sources.length > 0 && (
          <>
            <div style={{ padding: '20px 20px 12px', borderBottom: '1px solid #f0f0ec' }}>
              <div style={{ fontSize: '13px', fontWeight: '600', color: '#1a1a1a' }}>Materiali caricati</div>
              <div style={{ fontSize: '11px', color: '#aaa', marginTop: '3px' }}>
                {sources.length} fonte{sources.length > 1 ? 'i' : ''} · ~{totalWords.toLocaleString()} parole
              </div>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '12px' }}>
              {sources.map((s, i) => (
                <div key={s.id} style={{
                  background: '#f9f9f7',
                  border: '1px solid #e8e8e4',
                  borderRadius: '10px',
                  padding: '12px',
                  marginBottom: '10px'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                    <div style={{
                      width: '8px', height: '8px', borderRadius: '50%',
                      background: SOURCE_COLORS[i % SOURCE_COLORS.length],
                      flexShrink: 0
                    }} />
                    <span style={{ flex: 1, fontSize: '12px', fontWeight: '500', color: '#1a1a1a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {s.name}
                    </span>
                    <span style={{ fontSize: '11px', color: '#aaa', flexShrink: 0 }}>{s.size}</span>
                    <button onClick={() => removeSource(s.id)} style={{
                      background: 'none', border: 'none', cursor: 'pointer',
                      color: '#ccc', fontSize: '16px', lineHeight: 1, padding: '0 2px',
                      flexShrink: 0
                    }}>×</button>
                  </div>

                  {/* Weight slider */}
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                      <span style={{ fontSize: '11px', color: '#888' }}>Importanza</span>
                      <span style={{ fontSize: '11px', fontWeight: '500', color: SOURCE_COLORS[i % SOURCE_COLORS.length] }}>
                        {weightLabel(s.weight)}
                      </span>
                    </div>
                    <input
                      type="range" min="0.1" max="1" step="0.1"
                      value={s.weight}
                      onChange={e => setWeight(s.id, e.target.value)}
                      style={{ width: '100%', accentColor: SOURCE_COLORS[i % SOURCE_COLORS.length], cursor: 'pointer' }}
                    />
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '2px' }}>
                      <span style={{ fontSize: '10px', color: '#ccc' }}>Bassa</span>
                      <span style={{ fontSize: '10px', color: '#ccc' }}>Alta</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Analyze button in sidebar */}
            <div style={{ padding: '16px', borderTop: '1px solid #f0f0ec' }}>
              {error && <div style={{ fontSize: '12px', color: '#c0392b', background: '#fdf0ed', padding: '8px 10px', borderRadius: '6px', marginBottom: '10px' }}>{error}</div>}
              {loading
                ? <div style={{ textAlign: 'center', fontSize: '13px', color: '#888', padding: '10px' }}>Analisi in corso...</div>
                : <button
                    onClick={analyze}
                    style={{
                      width: '100%', padding: '11px',
                      background: '#1a1a1a', color: '#fff',
                      border: 'none', borderRadius: '8px',
                      fontSize: '13px', fontWeight: '500',
                      cursor: 'pointer', fontFamily: 'inherit'
                    }}>
                    Analizza e calcola gemellaggio →
                  </button>
              }
            </div>
          </>
        )}
      </div>

      {/* Main area */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
        <div style={{ width: '100%', maxWidth: '520px', display: 'flex', flexDirection: 'column', gap: '16px' }}>

          <div>
            <div style={{ fontSize: '26px', fontWeight: '700', letterSpacing: '-0.5px', color: '#1a1a1a' }}>Mirror Me</div>
            <div style={{ fontSize: '14px', color: '#888', marginTop: '4px', lineHeight: '1.5' }}>
              Carica le tue chat e crea il tuo gemello digitale.
              {sources.length > 0 && <span style={{ color: '#6366f1', marginLeft: '6px' }}>Aggiungi altre fonti per migliorare il gemellaggio.</span>}
            </div>
          </div>

          {/* Drop zone */}
          <div
            onDragOver={e => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            onClick={() => document.getElementById('fi').click()}
            style={{
              border: `2px dashed ${dragging ? '#6366f1' : '#d0d0c8'}`,
              borderRadius: '14px',
              padding: '32px',
              textAlign: 'center',
              cursor: 'pointer',
              background: dragging ? '#f0f0ff' : '#fff',
              transition: 'all .15s'
            }}>
            <div style={{ fontSize: '32px', marginBottom: '8px' }}>↑</div>
            <div style={{ fontSize: '14px', color: '#555', fontWeight: '500' }}>
              {sources.length > 0 ? 'Aggiungi altre fonti' : 'Carica file'}
            </div>
            <div style={{ fontSize: '12px', color: '#aaa', marginTop: '4px' }}>
              .txt, .json, .csv · trascina o clicca
            </div>
            <input type="file" id="fi" multiple accept=".txt,.json,.csv" style={{ display: 'none' }} onChange={e => addFiles(e.target.files)} />
          </div>

          {/* Paste area */}
          <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e8e8e4', padding: '16px' }}>
            <div style={{ fontSize: '12px', color: '#888', fontWeight: '500', marginBottom: '8px' }}>Incolla testo</div>
            <textarea
              value={paste}
              onChange={e => setPaste(e.target.value)}
              placeholder="Messaggi, note, email..."
              style={{
                width: '100%', height: '90px', padding: '8px 10px',
                fontSize: '13px', background: '#f9f9f7',
                border: '1px solid #e8e8e4', borderRadius: '8px',
                resize: 'vertical', color: '#1a1a1a', outline: 'none',
                fontFamily: 'inherit'
              }}
            />
            <button
              onClick={addPaste}
              disabled={paste.trim().length < 10}
              style={{
                marginTop: '8px', padding: '7px 16px',
                background: paste.trim().length >= 10 ? '#1a1a1a' : '#f0f0ec',
                color: paste.trim().length >= 10 ? '#fff' : '#aaa',
                border: 'none', borderRadius: '6px',
                fontSize: '12px', cursor: paste.trim().length >= 10 ? 'pointer' : 'not-allowed',
                fontFamily: 'inherit'
              }}>
              + Aggiungi come fonte
            </button>
          </div>

          {/* If no sources yet, show analyze button here too */}
          {sources.length === 0 && (
            <div style={{ fontSize: '12px', color: '#aaa', textAlign: 'center' }}>
              Carica almeno una fonte per iniziare l'analisi
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
