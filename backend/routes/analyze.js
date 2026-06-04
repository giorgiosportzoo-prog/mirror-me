const express = require('express');
const Anthropic = require('@anthropic-ai/sdk');
const supabase = require('../supabase');

const router = express.Router();
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `Sei un esperto di linguistica e psicologia comportamentale.
Ti verrà fornito un testo con conversazioni e il nome dell'utente da analizzare.
Analizza ESCLUSIVAMENTE i messaggi scritti da quell'utente. Ignora tutti gli altri.
L'utente potrebbe apparire con varianti del nome (es. "Giorgio" = "Giorgio Fadda" = "G.Fadda").
Restituisci SOLO JSON valido, nessun backtick, nessun testo extra.

Regole per il gemellaggio (sii onesto e severo):
- Meno di 200 parole dell'utente → max 25
- 200-500 parole → max 35
- 500-1500 parole → max 50
- 1500-5000 parole → max 65
- 5000-15000 parole → max 78
- Oltre 15000 parole → max 88
- Fonti multiple → +5 bonus
- Un solo interlocutore → -5 penalità

Regole per il systemPrompt del gemello:
- Messaggi BREVI e DIRETTI, frammentati come l'originale
- NON essere logorroico
- Usa SOLO parole/espressioni/emoji che usa l'utente
- Rispecchia la lunghezza tipica dei messaggi

Struttura JSON:
{
  "name": "nome dedotto",
  "initials": "2 lettere maiuscole",
  "tone": "tono in 1-2 frasi",
  "style": "stile in 2-3 frasi con lunghezza tipica messaggi",
  "personality": "personalità in 2-3 frasi",
  "vocabulary": ["5 espressioni tipiche SOLO dell'utente"],
  "topics": ["4 temi ricorrenti"],
  "quirks": ["3 caratteristiche uniche"],
  "gemellaggio": numero,
  "gemellaggio_reason": "1 frase",
  "gemellaggio_potential": numero,
  "systemPrompt": "Sei [nome]. Rispondi SEMPRE in prima persona con messaggi brevi e diretti. Non essere logorroico. Usa solo queste espressioni tipiche: [lista]. [descrizione specifica dello stile]"
}`;

function parseTelegramJSON(content) {
  try {
    const data = JSON.parse(content);
    if (!data.messages) return content;
    const lines = [];
    for (const msg of data.messages) {
      if (msg.type !== 'message') continue;
      const from = msg.from || msg.from_id || 'Unknown';
      let text = '';
      if (typeof msg.text === 'string') text = msg.text;
      else if (Array.isArray(msg.text)) text = msg.text.map(t => typeof t === 'string' ? t : (t.text || '')).join('');
      if (!text.trim()) continue;
      lines.push(`${from}: ${text}`);
    }
    return lines.join('\n');
  } catch { return content; }
}

router.post('/', async (req, res) => {
  try {
    const { sources, userName, sessionId } = req.body;

    if (!sources || sources.length === 0) {
      return res.status(400).json({ error: 'Nessun materiale fornito.' });
    }
    if (!userName || userName.trim().length < 2) {
      return res.status(400).json({ error: 'Inserisci il tuo nome come appare nelle chat.' });
    }

    const MAX_TOTAL = 80000;
    const totalWeight = sources.reduce((sum, s) => sum + (s.weight || 1), 0);

    let combinedText = '';
    let totalWords = 0;
    const sourceNames = [];

    sources.forEach(source => {
      const weight = source.weight || 1;
      const ratio = weight / totalWeight;
      const allowedChars = Math.floor(MAX_TOTAL * ratio);

      // Parse Telegram JSON if needed
      let content = source.content;
      if (source.name && source.name.endsWith('.json')) {
        content = parseTelegramJSON(content);
      }

      const chunk = content.slice(0, allowedChars);
      totalWords += chunk.trim().split(/\s+/).length;
      sourceNames.push(source.name);
      combinedText += `\n\n--- FONTE: ${source.name} ---\n${chunk}`;
    });

    if (combinedText.trim().length < 20) {
      return res.status(400).json({ error: 'Testo troppo corto.' });
    }

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 1500,
      system: SYSTEM_PROMPT,
      messages: [{
        role: 'user',
        content: `Analizza i messaggi di "${userName}" (cerca tutte le varianti del nome). Fonti: ${sourceNames.join(', ')}.\n\n${combinedText}`
      }]
    });

    const raw = message.content[0].text.replace(/```json|```/g, '').trim();
    const profile = JSON.parse(raw);

    const { data, error } = await supabase
      .from('profiles')
      .insert({
        session_id: sessionId || crypto.randomUUID(),
        name: profile.name,
        initials: profile.initials,
        gemellaggio: profile.gemellaggio,
        gemellaggio_potential: profile.gemellaggio_potential,
        profile_json: profile,
        system_prompt: profile.systemPrompt,
        word_count: totalWords,
        last_learned_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) throw error;

    res.json({ profile, profileId: data.id, sessionId: data.session_id });

  } catch (err) {
    console.error('Analyze error:', err);
    res.status(500).json({ error: 'Errore durante l\'analisi. Riprova.' });
  }
});

module.exports = router;
