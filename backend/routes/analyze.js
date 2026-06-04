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
    const { sources, sessionId } = req.body;
    // sources: [{ name, content, weight }]  weight: 0.0-1.0

    if (!sources || sources.length === 0) {
      return res.status(400).json({ error: 'Nessun materiale fornito.' });
    }

    // Build combined text respecting weights
    // Each source gets a slice proportional to its weight
    const MAX_TOTAL = 60000;
    const totalWeight = sources.reduce((sum, s) => sum + (s.weight || 1), 0);

    let combinedText = '';
    let totalWords = 0;
    const sourceNames = [];

    sources.forEach(source => {
      const weight = source.weight || 1;
      const ratio = weight / totalWeight;
      const allowedChars = Math.floor(MAX_TOTAL * ratio);
      const chunk = source.content.slice(0, allowedChars);
      const words = chunk.trim().split(/\s+/).length;
      totalWords += words;
      sourceNames.push(source.name);
      combinedText += `\n\n--- FONTE: ${source.name} (importanza: ${Math.round(weight * 100)}%) ---\n${chunk}`;
    });

    if (combinedText.trim().length < 20) {
      return res.status(400).json({ error: 'Testo troppo corto. Incolla almeno qualche messaggio.' });
    }

    const sourceInfo = sources.length > 1
      ? `${sources.length} fonti: ${sourceNames.join(', ')}`
      : sourceNames[0];

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 1500,
      system: SYSTEM_PROMPT,
      messages: [{
        role: 'user',
        content: `Analizza questo testo (${totalWords} parole totali, ${sourceInfo}):\n\n${combinedText}`
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
