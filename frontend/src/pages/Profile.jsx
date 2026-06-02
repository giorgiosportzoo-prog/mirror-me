import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';

const API = import.meta.env.VITE_API_URL;

function gemColor(n) { return n >= 70 ? '#1D9E75' : n >= 50 ? '#BA7517' : '#C0392B'; }
function gemLabel(n) { return n >= 75 ? 'Eccellente' : n >= 60 ? 'Buono' : n >= 45 ? 'Discreto' : 'Parziale'; }

const s = {
  page: { minHeight: '100vh', background: '#f9f9f7', padding: '24px', display: 'flex', flexDirection: 'column', alignItems: 'center' },
  wrap: { width: '100%', maxWidth: '600px', display: 'flex', flexDirection: 'column', gap: '16px' },
  header: { display: 'flex', alignItems: 'center', gap: '12px', padding: '20px 24px', background: '#fff', borderRadius: '16px', border: '1px solid #e8e8e4' },
  avatar: { width: '48px', height: '48px', borderRadius: '50%', background: '#f0f0ec', border: '1px solid #e8e8e4', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px', fontWeight: '600', color: '#555', flexShrink: 0 },
  name: { fontSize: '18px', fontWeight: '600' },
  sub: { fontSize: '12px', color: '#888', marginTop: '2px' },
  gemCard: { background: '#fff', borderRadius: '16px', border: '1px solid #e8e8e4', padding: '20px 24px' },
  gemTop: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' },
  gemLabel: { fontSize: '12px', color: '#888', fontWeight: '500' },
  gemPct: { fontSize: '36px', fontWeight: '600' },
  gemBar: { height: '6px', background: '#f0f0ec', borderRadius: '3px', overflow: 'hidden', marginBottom: '8px' },
  gemFill: { height: '100%', borderRadius: '3px', transition: 'width 1.2s ease' },
  gemMeta: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  gemReason: { fontSize: '12px', color: '#aaa' },
  gemPotential: { fontSize: '12px', color: '#888' },
  grid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' },
  card: { background: '#fff', borderRadius: '12px', border: '1px solid #e8e8e4', padding: '14px 16px' },
  cardFull: { background: '#fff', borderRadius: '12px', border: '1px solid #e8e8e4', padding: '14px 16px', gridColumn: '1 / -1' },
  cardTitle: { fontSize: '10px', color: '#aaa', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '8px' },
  cardText: { fontSize: '13px', color: '#1a1a1a', lineHeight: '1.55' },
  tags: { display: 'flex', flexWrap: 'wrap', gap: '5px' },
  tag: { padding: '3px 10px', background: '#f5f5f2', border: '1px solid #e8e8e4', borderRadius: '20px', fontSize: '12px', color: '#555' },
  btn: { width: '100%', padding: '12px', background: '#1a1a1a', color: '#fff', border: 'none', borderRadius: '10px', fontSize: '14px', fontWeight: '500', cursor: 'pointer', fontFamily: 'inherit' },
  btnSec: { width: '100%', padding: '11px', background: 'none', color: '#1a1a1a', border: '1px solid #d0d0c8', borderRadius: '10px', fontSize: '13px', cursor: 'pointer', fontFamily: 'inherit', marginTop: '8px' },
  loading: { textAlign: 'center', padding: '60px', color: '#aaa', fontSize: '14px' }
};

export default function Profile() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [profile, setProfile] = useState(null);
  const [gemWidth, setGemWidth] = useState(0);

  useEffect(() => {
    fetch(`${API}/api/profile/${id}`)
      .then(r => r.json())
      .then(data => {
        setProfile(data);
        setTimeout(() => setGemWidth(data.gemellaggio), 200);
      });
  }, [id]);

  if (!profile) return <div style={s.page}><div style={s.loading}>Caricamento profilo...</div></div>;

  const p = profile.profile_json;
  const col = gemColor(profile.gemellaggio);

  return (
    <div style={s.page}>
      <div style={s.wrap}>
        <div style={s.header}>
          <div style={s.avatar}>{p.initials}</div>
          <div>
            <div style={s.name}>{p.name}</div>
            <div style={s.sub}>Profilo creato adesso</div>
          </div>
        </div>

        <div style={s.gemCard}>
          <div style={s.gemTop}>
            <span style={s.gemLabel}>Gemellaggio digitale</span>
            <span style={{ ...s.gemPct, color: col }}>{profile.gemellaggio}%</span>
          </div>
          <div style={s.gemBar}>
            <div style={{ ...s.gemFill, width: gemWidth + '%', background: col }} />
          </div>
          <div style={s.gemMeta}>
            <span style={s.gemReason}>{p.gemellaggio_reason}</span>
            {p.gemellaggio_potential > profile.gemellaggio && (
              <span style={s.gemPotential}>Potenziale: {p.gemellaggio_potential}% con più materiale</span>
            )}
          </div>
        </div>

        <div style={s.grid}>
          <div style={s.cardFull}><div style={s.cardTitle}>Tono</div><div style={s.cardText}>{p.tone}</div></div>
          <div style={s.cardFull}><div style={s.cardTitle}>Stile</div><div style={s.cardText}>{p.style}</div></div>
          <div style={s.cardFull}><div style={s.cardTitle}>Personalità</div><div style={s.cardText}>{p.personality}</div></div>
          <div style={s.card}><div style={s.cardTitle}>Vocabolario tipico</div><div style={s.tags}>{p.vocabulary.map((v, i) => <span key={i} style={s.tag}>{v}</span>)}</div></div>
          <div style={s.card}><div style={s.cardTitle}>Argomenti ricorrenti</div><div style={s.tags}>{p.topics.map((t, i) => <span key={i} style={s.tag}>{t}</span>)}</div></div>
          <div style={s.cardFull}><div style={s.cardTitle}>Caratteristiche uniche</div><div style={s.tags}>{p.quirks.map((q, i) => <span key={i} style={s.tag}>{q}</span>)}</div></div>
        </div>

        <div>
          <button style={s.btn} onClick={() => navigate(`/chat/${id}`)}>Chatta con il tuo alter ego →</button>
          <button style={s.btnSec} onClick={() => navigate('/')}>+ Aggiungi altro materiale</button>
        </div>
      </div>
    </div>
  );
}
