const express = require('express');
const Anthropic = require('@anthropic-ai/sdk');
const supabase = require('../supabase');

const router = express.Router();
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `Sei un esperto di linguistica e psicologia comportamentale. 
Analizza il testo fornito e restituisci SOLO JSON valido, nessun backtick, nessun testo extra.

Regole per il gemellaggio (sii onesto e severo):
- Meno di 200 parole → max 25
- 200-500 parole → max 35
- 500-1500 parole → max 50
- 1500-5000 parole → max 65
- 5000-15000 parole → max 78
- Oltre 15000 parole → max 88
- Fonti multiple (chat diverse, note, email) → +5 bonus
- Un solo interlocutore → -5 penalità

Struttura JSON esatta:
{
  "name": "nome o soprannome dedotto dal testo",
  "initials": "2 lettere maiuscole",
  "tone": "descrizione tono in 1-2 frasi",
  "style": "stile di scrittura in 2-3 frasi",
  "personality": "personalità emergente in 2-3 frasi",
  "vocabulary": ["5 parole o espressioni tipiche"],
  "topics": ["4 temi ricorrenti"],
  "quirks": ["3 caratteristiche uniche dello stile"],
  "gemellaggio": numero_intero_calcolato_secondo_regole,
  "gemellaggio_reason": "1 frase che spiega il punteggio",
  "gemellaggio_potential": numero_intero_raggiungibile_con_più_materiale,
  "systemPrompt": "Sei [nome]. Rispondi SEMPRE in prima persona imitando fedelmente questo stile: [descrizione molto dettagliata del tono, vocabolario tipico, struttura delle frasi, argomenti ricorrenti, errori tipici, emoji usate]"
}`;

router.post('/', async (req, res) => {
  try {
    const { text, sessionId } = req.body;
    if (!text || text.trim().length < 20) {
      return res.status(400).json({ error: 'Testo troppo corto. Incolla almeno qualche messaggio.' });
    }

    const wordCount = text.trim().split(/\s+/).length;
    const truncated = text.slice(0, 12000);

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1500,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: `Analizza questo testo (${wordCount} parole):\n\n${truncated}` }]
    });

    const raw = message.content[0].text.replace(/```json|```/g, '').trim();
    const profile = JSON.parse(raw);

    // Save to Supabase
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
        word_count: wordCount,
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
