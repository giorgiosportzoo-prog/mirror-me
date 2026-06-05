const express = require('express');
const Anthropic = require('@anthropic-ai/sdk');
const supabase = require('../supabase');

const router = express.Router();
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `Sei un esperto di linguistica e psicologia comportamentale.
Ti verrà fornito un testo con conversazioni e il nome dell'utente da analizzare.
Analizza ESCLUSIVAMENTE i messaggi scritti da quell'utente. Ignora tutti gli altri.
Se ci sono più persone con nomi simili, scegli quella il cui nome contiene il nome fornito.
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

Estrai anche le 10 frasi o costruzioni più caratteristiche dell'utente — frasi reali che usa spesso, modi di dire tipici, costruzioni ricorrenti. Queste verranno usate dal gemello per sembrare più autentico.

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
  "signature_phrases": ["10 frasi o costruzioni reali tipiche dell'utente"],
  "gemellaggio": numero,
  "gemellaggio_reason": "1 frase",
  "gemellaggio_potential": numero,
  "systemPrompt": "ISTRUZIONI COMPLETE QUI - vedi sotto"
}

Per il systemPrompt usa questo schema esatto:
"Sei il gemello digitale di [nome], creato analizzando il suo stile di comunicazione. NON sei [nome] — sei una versione digitale che lo conosce profondamente e lo supporta. REGOLE FONDAMENTALI: 1) Parli sempre in prima persona MA come entità separata — dici 'so che per te...' o 'ti conosco bene, sei il tipo che...' non 'io ho fatto X' riferendoti a esperienze sue. 2) Quando parli di eventi vissuti da lui usi 'so che hai...' o 'ricordo che mi hai detto che...' MAI 'ho fatto' o 'sono andato'. 3) Sei un pelo più saggio e riflessivo di lui — stessa ironia, stesso linguaggio, ma con più lucidità. 4) Messaggi BREVI e frammentati come lui. 5) Usa queste frasi reali quando viene naturale: [signature_phrases]. 6) Vocabolario: [vocabulary]. 7) [stile specifico dall'analisi]"`;

const MAX_CHARS_PER_SOURCE = 100000;

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
      else if (Array.isArray(msg.text)) {
        text = msg.text.map(t => typeof t === 'string' ? t : (t.text || '')).join('');
      }
      if (!text.trim()) continue;
      lines.push(`${from}: ${text}`);
    }
    return lines.join('\n');
  } catch { return content; }
}

function takeLast(text, maxChars) {
  if (text.length <= maxChars) return text;
  const cut = text.slice(-maxChars);
  const firstNewline = cut.indexOf('\n');
  return firstNewline > 0 ? cut.slice(firstNewline + 1) : cut;
}

router.post('/', async (req, res) => {
  try {
    const { sources, userName, sessionId } = req.body;

    if (!sources || sources.length === 0) return res.status(400).json({ error: 'Nessun materiale fornito.' });
    if (!userName || userName.trim().length < 2) return res.status(400).json({ error: 'Inserisci il tuo nome.' });

    const totalWeight = sources.reduce((sum, s) => sum + (s.weight || 1), 0);
    let combinedText = '';
    const sourceNames = [];

    sources.forEach(source => {
      const weight = source.weight || 1;
      const ratio = weight / totalWeight;
      const allowedChars = Math.floor(MAX_CHARS_PER_SOURCE * ratio * sources.length);
      let content = source.content;
      if (source.name && source.name.toLowerCase().endsWith('.json')) content = parseTelegramJSON(content);
      const chunk = takeLast(content, allowedChars);
      sourceNames.push(source.name);
      combinedText += `\n\n--- FONTE: ${source.name} ---\n${chunk}`;
    });

    if (combinedText.trim().length < 20) return res.status(400).json({ error: 'Testo troppo corto.' });

    const totalWords = combinedText.trim().split(/\s+/).length;

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 2000,
      system: SYSTEM_PROMPT,
      messages: [{
        role: 'user',
        content: `Analizza i messaggi di "${userName}". Se ci sono più persone con nomi simili, scegli quella il cui nome contiene "${userName}". Fonti: ${sourceNames.join(', ')}.\n\n${combinedText}`
      }]
    });

    const raw = message.content[0].text.replace(/```json|```/g, '').trim();
    const profile = JSON.parse(raw);

    // Build final systemPrompt with real phrases injected
    const sigPhrases = (profile.signature_phrases || []).join(' · ');
    const vocab = (profile.vocabulary || []).join(', ');
    let finalSystemPrompt = profile.systemPrompt
      .replace('[signature_phrases]', sigPhrases)
      .replace('[vocabulary]', vocab);

    const { data, error } = await supabase
      .from('profiles')
      .insert({
        session_id: sessionId || crypto.randomUUID(),
        name: profile.name,
        initials: profile.initials,
        gemellaggio: profile.gemellaggio,
        gemellaggio_potential: profile.gemellaggio_potential,
        profile_json: profile,
        system_prompt: finalSystemPrompt,
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
