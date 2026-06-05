const express = require('express');
const Anthropic = require('@anthropic-ai/sdk');
const supabase = require('../supabase');

const router = express.Router();
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const WINDOW_SIZE = 20;
const LEARN_EVERY = 6;

// Extract facts ONLY from user message, never from gemello response
async function extractFacts(userMsg, existingFacts) {
  const res = await anthropic.messages.create({
    model: 'claude-sonnet-4-5',
    max_tokens: 200,
    system: `Estrai fatti importanti e permanenti dal messaggio dell'utente — eventi biografici, emozioni forti, decisioni rilevanti, relazioni, salute, lavoro. 
Restituisci SOLO JSON: {"facts": ["fatto conciso"]} oppure {"facts": []}.
Max 15 parole per fatto. Ignora cose banali o temporanee.
NON includere opinioni o riflessioni generiche — solo fatti concreti sulla vita dell'utente.`,
    messages: [{
      role: 'user',
      content: `Fatti già noti: ${existingFacts.join('; ') || 'nessuno'}\n\nMessaggio utente: "${userMsg}"\n\nNuovi fatti da aggiungere?`
    }]
  });
  try {
    const parsed = JSON.parse(res.content[0].text.replace(/```json|```/g, '').trim());
    return parsed.facts || [];
  } catch { return []; }
}

// Update style learnings from USER messages only
async function updateStyleLearnings(recentMessages, currentLearnings, profileName) {
  // Filter only user messages
  const userMessages = recentMessages
    .filter(m => m.role === 'user')
    .map(m => m.content)
    .join('\n');

  if (!userMessages.trim()) return { learnings: currentLearnings, delta: 0 };

  const res = await anthropic.messages.create({
    model: 'claude-sonnet-4-5',
    max_tokens: 400,
    system: `Sei un analista linguistico. Analizza SOLO i messaggi dell'utente e aggiorna i learnings sul suo stile comunicativo reale.
Restituisci SOLO JSON: {"learnings": ["learning specifico"], "gemellaggio_delta": numero_tra_-1_e_2}
Learnings devono essere specifici e basati su pattern reali osservati: "Non usa mai X", "Usa spesso Y", "Tende a Z quando parla di W".
gemellaggio_delta: quanto il gemellaggio dovrebbe salire basandosi sulla qualità del materiale.`,
    messages: [{
      role: 'user',
      content: `Learnings attuali: ${currentLearnings.join('; ') || 'nessuno'}\n\nMessaggi utente da analizzare:\n${userMessages}\n\nAggiorna i learnings.`
    }]
  });
  try {
    const parsed = JSON.parse(res.content[0].text.replace(/```json|```/g, '').trim());
    return { learnings: parsed.learnings || currentLearnings, delta: parsed.gemellaggio_delta || 0 };
  } catch { return { learnings: currentLearnings, delta: 0 }; }
}

async function compressMessages(messages, profileName) {
  const conversation = messages.map(m => `${m.role === 'user' ? 'Utente' : profileName}: ${m.content}`).join('\n');
  const res = await anthropic.messages.create({
    model: 'claude-sonnet-4-5',
    max_tokens: 150,
    system: 'Riassumi questa conversazione in 2-3 frasi, mantenendo solo i punti chiave.',
    messages: [{ role: 'user', content: conversation }]
  });
  return res.content[0].text;
}

router.post('/', async (req, res) => {
  try {
    const { profileId, message, history } = req.body;
    if (!profileId || !message) return res.status(400).json({ error: 'profileId e message richiesti' });

    const { data: profile, error: profileError } = await supabase
      .from('profiles').select('*').eq('id', profileId).single();
    if (profileError || !profile) return res.status(404).json({ error: 'Profilo non trovato' });

    const { data: memoryData } = await supabase
      .from('chat_memory').select('*').eq('profile_id', profileId).single();

    const permanentFacts = memoryData?.permanent_facts || [];
    const styleLearnings = memoryData?.style_learnings || [];
    const conversationSummary = memoryData?.conversation_summary || '';
    const totalMessages = memoryData?.total_messages || 0;

    // Build system prompt
    let systemPrompt = profile.system_prompt;

    if (permanentFacts.length > 0) {
      systemPrompt += `\n\nCOSE CHE SAI DI LUI (ha condiviso con te):\n${permanentFacts.map(f => `- ${f}`).join('\n')}`;
    }

    if (styleLearnings.length > 0) {
      systemPrompt += `\n\nHAI IMPARATO SUL SUO STILE:\n${styleLearnings.map(l => `- ${l}`).join('\n')}`;
    }

    // Build messages with sliding window
    const messages = [];

    if (conversationSummary) {
      messages.push({ role: 'user', content: `[Contesto conversazione precedente: ${conversationSummary}]` });
      messages.push({ role: 'assistant', content: 'Ok, ho il contesto.' });
    }

    const recentHistory = (history || [])
      .filter(m => m.content && m.content.trim().length > 0)
      .slice(-WINDOW_SIZE);
    recentHistory.forEach(m => messages.push({ role: m.role, content: m.content }));
    messages.push({ role: 'user', content: message });

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 400,
      system: systemPrompt,
      messages
    });

    const reply = response.content[0].text;
    const newTotalMessages = totalMessages + 2;

    await supabase.from('chat_history').insert([
      { profile_id: profileId, role: 'user', content: message },
      { profile_id: profileId, role: 'assistant', content: reply }
    ]);

    let newFacts = [];
    let newLearnings = styleLearnings;
    let gemellaggioDelta = 0;
    let newSummary = conversationSummary;

    try {
      // Extract facts ONLY from user message
      newFacts = await extractFacts(message, permanentFacts);
      const updatedFacts = [...permanentFacts, ...newFacts.filter(f => !permanentFacts.includes(f))];

      // Update style learnings from user messages only
      if (newTotalMessages % LEARN_EVERY === 0) {
        const allRecent = [
          ...(history || []).slice(-LEARN_EVERY),
          { role: 'user', content: message }
        ];
        const result = await updateStyleLearnings(allRecent, styleLearnings, profile.name);
        newLearnings = result.learnings;
        gemellaggioDelta = result.delta;
      }

      // Compress old messages
      if ((history || []).length > WINDOW_SIZE) {
        const toCompress = (history || []).slice(0, -WINDOW_SIZE);
        if (toCompress.length >= 4) {
          newSummary = await compressMessages(toCompress, profile.name);
        }
      }

      await supabase.from('chat_memory').upsert({
        profile_id: profileId,
        permanent_facts: [...permanentFacts, ...newFacts.filter(f => !permanentFacts.includes(f))],
        style_learnings: newLearnings,
        conversation_summary: newSummary,
        total_messages: newTotalMessages,
        updated_at: new Date().toISOString()
      }, { onConflict: 'profile_id' });

      if (gemellaggioDelta !== 0) {
        const newGem = Math.min(88, Math.max(0, (profile.gemellaggio || 0) + gemellaggioDelta));
        await supabase.from('profiles').update({ gemellaggio: newGem }).eq('id', profileId);
      }

    } catch (memErr) {
      console.error('Memory update error:', memErr.message);
    }

    res.json({
      reply,
      totalMessages: newTotalMessages,
      newFacts,
      learnedSomething: newTotalMessages % LEARN_EVERY === 0,
      gemellaggio: (profile.gemellaggio || 0) + gemellaggioDelta
    });

  } catch (err) {
    console.error('Chat error:', err);
    res.status(500).json({ error: 'Errore nella chat. Riprova.' });
  }
});

router.post('/learn', async (req, res) => {
  try {
    const { profileId } = req.body;
    if (!profileId) return res.status(400).json({ error: 'profileId richiesto' });

    const { data: profile } = await supabase.from('profiles').select('*').eq('id', profileId).single();
    const { data: memory } = await supabase.from('chat_memory').select('*').eq('profile_id', profileId).single();

    const { data: recentChats } = await supabase
      .from('chat_history').select('role, content, created_at')
      .eq('profile_id', profileId)
      .order('created_at', { ascending: false })
      .limit(30);

    if (!recentChats || recentChats.length < 4) {
      return res.json({ updated: false, reason: 'Troppo pochi scambi' });
    }

    const result = await updateStyleLearnings(
      recentChats.reverse(),
      memory?.style_learnings || [],
      profile.name
    );

    const newGem = Math.min(88, Math.max(0, (profile.gemellaggio || 0) + result.delta));

    await supabase.from('chat_memory').upsert({
      profile_id: profileId,
      permanent_facts: memory?.permanent_facts || [],
      style_learnings: result.learnings,
      conversation_summary: memory?.conversation_summary || '',
      total_messages: memory?.total_messages || 0,
      updated_at: new Date().toISOString()
    }, { onConflict: 'profile_id' });

    await supabase.from('profiles').update({
      gemellaggio: newGem,
      last_learned_at: new Date().toISOString()
    }).eq('id', profileId);

    res.json({ updated: true, learnings: result.learnings, gemellaggio: newGem });

  } catch (err) {
    console.error('Learn error:', err);
    res.status(500).json({ error: 'Errore aggiornamento.' });
  }
});

module.exports = router;
