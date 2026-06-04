const express = require('express');
const Anthropic = require('@anthropic-ai/sdk');
const supabase = require('../supabase');

const router = express.Router();
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `Sei un esperto di linguistica e psicologia comportamentale.
Analizza SOLO i messaggi scritti dall'utente specificato. Ignora completamente i messaggi degli altri interlocutori.
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

Stile di risposta del gemello:
- Messaggi BREVI e DIRETTI, spesso frammentati in più messaggi consecutivi
- NON essere logorroico — l'utente originale probabilmente scrive poco per volta
- Rispecchia la lunghezza tipica dei messaggi dell'utente
- Usa SOLO le parole, espressioni e emoji che usa l'utente — mai inventare

Struttura JSON:
{
  "name": "nome dedotto",
  "initials": "2 lettere maiuscole",
  "tone": "tono in 1-2 frasi",
  "style": "stile scrittura in 2-3 frasi — includi lunghezza tipica messaggi",
  "personality": "personalità in 2-3 frasi",
  "vocabulary": ["5 parole/espressioni tipiche SOLO dell'utente"],
  "topics": ["4 temi ricorrenti"],
  "quirks": ["3 caratteristiche uniche"],
  "gemellaggio": numero,
  "gemellaggio_reason": "1 frase",
  "gemellaggio_potential": numero,
  "systemPrompt": "Sei [nome]. Rispondi SEMPRE in prima persona. Messaggi brevi e diretti come l'utente originale. Non essere logorroico. Usa solo queste parole/espressioni tipiche: [lista]. Stile: [descrizione molto specifica del tono e lunghezza messaggi]"
}`;

function filterUserMessages(text, userName) {
  if (!userName) return text;

  const lines = text.split('\n');
  const userLines = [];
  let capturing = false;

  for (const line of lines) {
    // Match patterns like "Giorgio: ", "[Giorgio]", "Giorgio > "
    const isUserLine =
      line.includes(`] ${userName}:`) ||
      line.includes(`${userName}:`) ||
      line.startsWith(`${userName} `);

    if (isUserLine) {
      capturing = true;
      userLines.push(line);
    } else if (capturing && line.trim() === '') {
      userLines.push(line);
    } else if (capturing && !line.match(/^\[?\d/) && !line.includes(':')) {
      // continuation of previous message
      userLines.push(line);
    } else {
      capturing = false;
    }
  }

  // If filtering found messages, use them; otherwise return original
  const filtered = userLines.join('\n').trim();
  return filtered.length > 100 ? filtered : text;
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

    const MAX_TOTAL = 60000;
    const totalWeight = sources.reduce((sum, s) => sum + (s.weight || 1), 0);

    let combinedText = '';
    let totalWords = 0;
    const sourceNames = [];

    sources.forEach(source => {
      const weight = source.weight || 1;
      const ratio = weight / totalWeight;
      const allowedChars = Math.floor(MAX_TOTAL * ratio);

      // Filter to user messages only
      const filtered = filterUserMessages(source.content, userName.trim());
      const chunk = filtered.slice(0, allowedChars);
      const words = chunk.trim().split(/\s+/).length;
      totalWords += words;
      sourceNames.push(source.name);
      combinedText += `\n\n--- FONTE: ${source.name} (importanza: ${Math.round(weight * 100)}%) ---\n${chunk}`;
    });

    if (combinedText.trim().length < 20) {
      return res.status(400).json({ error: 'Testo troppo corto dopo il filtraggio.' });
    }

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 1500,
      system: SYSTEM_PROMPT,
      messages: [{
        role: 'user',
        content: `Analizza i messaggi di "${userName}" (${totalWords} parole, ${sources.length} fonte/i: ${sourceNames.join(', ')}):\n\n${combinedText}`
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
