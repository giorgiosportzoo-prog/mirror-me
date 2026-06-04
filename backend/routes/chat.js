const express = require('express');
const Anthropic = require('@anthropic-ai/sdk');
const supabase = require('../supabase');

const router = express.Router();
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const WINDOW_SIZE = 20; // max messages in active window
const LEARN_EVERY = 6;  // update style learnings every N messages

// Extract important facts from a message exchange
async function extractFacts(userMsg, assistantMsg, existingFacts) {
  const res = await anthropic.messages.create({
    model: 'claude-sonnet-4-5',
    max_tokens: 300,
    system: `Sei un estrattore di fatti importanti. Analizza il messaggio dell'utente e decidi se contiene informazioni biografiche o emotive significative da ricordare permanentemente (morti, nascite, relazioni, lavoro, salute, decisioni importanti, eventi forti).
Restituisci SOLO JSON: {"facts": ["fatto1", "fatto2"]} oppure {"facts": []} se non c'è nulla di importante.
Ignora cose banali o temporanee. Sii conciso — max 15 parole per fatto.`,
    messages: [{
      role: 'user',
      content: `Fatti già noti: ${existingFacts.join('; ') || 'nessuno'}\n\nMessaggio utente: "${userMsg}"\nRisposta gemello: "${assistantMsg}"\n\nNuovi fatti importanti da aggiungere?`
    }]
  });
  try {
    const parsed = JSON.parse(res.content[0].text.replace(/```json|```/g, '').trim());
    return parsed.facts || [];
  } catch { return []; }
}

// Update style learnings from recent conversation
async function updateStyleLearnings(recentMessages, currentLearnings, profileName) {
  const conversation = recentMessages.map(m => `${m.role === 'user' ? 'Interlocutore' : profileName}: ${m.content}`).join('\n');
  const res = await anthropic.messages.create({
    model: 'claude-sonnet-4-5',
    max_tokens: 400,
    system: `Sei un analista linguistico. Osserva la conversazione e aggiorna i learnings sullo stile comunicativo di ${profileName}.
Restituisci SOLO JSON: {"learnings": ["learning1", "learning2", ...], "gemellaggio_delta": numero_tra_-2_e_3}
I learnings devono essere specifici: "Non usa mai X", "Usa spesso Y", "Risponde con una parola quando Z", ecc.
gemellaggio_delta è quanto il gemellaggio dovrebbe aumentare o diminuire in base a quanto bene il gemello sta imitando.`,
    messages: [{
      role: 'user',
      content: `Learnings attuali: ${currentLearnings.join('; ') || 'nessuno'}\n\nConversazione recente:\n${conversation}\n\nAggiorna i learnings.`
    }]
  });
  try {
    const parsed = JSON.parse(res.content[0].text.replace(/```json|```/g, '').trim());
    return {
      learnings: parsed.learnings || currentLearnings,
      delta: parsed.gemellaggio_delta || 0
    };
  } catch { return { learnings: currentLearnings, delta: 0 }; }
}

// Compress old messages into a summary
async function compressMessages(messages, profileName) {
  const conversation = messages.map(m => `${m.role === 'user' ? 'Interlocutore' : profileName}: ${m.content}`).join('\n');
  const res = await anthropic.messages.create({
    model: 'claude-sonnet-4-5',
    max_tokens: 200,
    system: 'Riassumi questa conversazione in 3-5 frasi concise, mantenendo i punti chiave discussi.',
    messages: [{ role: 'user', content: conversation }]
  });
  return res.content[0].text;
}

// Main chat endpoint
router.post('/', async (req, res) => {
  try {
    const { profileId, message, history } = req.body;
    if (!profileId || !message) return res.status(400).json({ error: 'profileId e message richiesti' });

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', profileId)
      .single();
    if (profileError || !profile) return res.status(404).json({ error: 'Profilo non trovato' });

    // Load persistent memory from DB
    const { data: memoryData } = await supabase
      .from('chat_memory')
      .select('*')
      .eq('profile_id', profileId)
      .single();

    const permanentFacts = memoryData?.permanent_facts || [];
    const styleLearnings = memoryData?.style_learnings || [];
    const conversationSummary = memoryData?.conversation_summary || '';
    const totalMessages = memoryData?.total_messages || 0;

    // Build system prompt with all memory layers
    let systemPrompt = profile.system_prompt;

    // Inject "smarter/wiser" instruction
    systemPrompt += `\n\nSei una versione leggermente migliorata di ${profile.name} — stesso stile, stesso linguaggio, ma un pelo più saggio e riflessivo. Non cambiare il modo di scrivere, solo il livello di insight.`;

    if (permanentFacts.length > 0) {
      systemPrompt += `\n\nFATTI PERMANENTI (non dimenticare mai):\n${permanentFacts.map(f => `- ${f}`).join('\n')}`;
    }

    if (styleLearnings.length > 0) {
      systemPrompt += `\n\nLEARNINGS SULLO STILE (aggiornati dalla conversazione):\n${styleLearnings.map(l => `- ${l}`).join('\n')}`;
    }

    // Build message history with sliding window
    const messages = [];

    // Add summary of older conversation if exists
    if (conversationSummary) {
      messages.push({
        role: 'user',
        content: `[Riassunto conversazione precedente: ${conversationSummary}]`
      });
      messages.push({
        role: 'assistant',
        content: 'Ho letto il riassunto.'
      });
    }

    // Add recent window
    const recentHistory = (history || []).slice(-WINDOW_SIZE);
    recentHistory.forEach(m => messages.push({ role: m.role, content: m.content }));
    messages.push({ role: 'user', content: message });

    // Get response
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 500,
      system: systemPrompt,
      messages
    });

    const reply = response.content[0].text;
    const newTotalMessages = totalMessages + 2;

    // Save messages to chat_history
    await supabase.from('chat_history').insert([
      { profile_id: profileId, role: 'user', content: message },
      { profile_id: profileId, role: 'assistant', content: reply }
    ]);

    // Extract important facts (async, don't block response)
    let newFacts = [];
    let newLearnings = styleLearnings;
    let gemellaggioDelta = 0;
    let newSummary = conversationSummary;

    try {
      // Check for important facts
      newFacts = await extractFacts(message, reply, permanentFacts);
      const updatedFacts = [...permanentFacts, ...newFacts.filter(f => !permanentFacts.includes(f))];

      // Update style learnings every LEARN_EVERY messages
      if (newTotalMessages % LEARN_EVERY === 0) {
        const allRecent = [...(history || []).slice(-LEARN_EVERY), { role: 'user', content: message }, { role: 'assistant', content: reply }];
        const result = await updateStyleLearnings(allRecent, styleLearnings, profile.name);
        newLearnings = result.learnings;
        gemellaggioDelta = result.delta;
      }

      // Compress old messages if window is full
      if ((history || []).length > WINDOW_SIZE) {
        const toCompress = (history || []).slice(0, -WINDOW_SIZE);
        if (toCompress.length >= 4) {
          newSummary = await compressMessages(toCompress, profile.name);
        }
      }

      // Update memory in DB
      await supabase.from('chat_memory').upsert({
        profile_id: profileId,
        permanent_facts: updatedFacts,
        style_learnings: newLearnings,
        conversation_summary: newSummary,
        total_messages: newTotalMessages,
        updated_at: new Date().toISOString()
      }, { onConflict: 'profile_id' });

      // Update gemellaggio if changed
      if (gemellaggioDelta !== 0) {
        const newGem = Math.min(88, Math.max(0, (profile.gemellaggio || 0) + gemellaggioDelta));
        await supabase.from('profiles').update({ gemellaggio: newGem }).eq('id', profileId);
      }

    } catch (memErr) {
      console.error('Memory update error (non-blocking):', memErr.message);
    }

    res.json({
      reply,
      totalMessages: newTotalMessages,
      newFacts,
      learnedSomething: newTotalMessages % LEARN_EVERY === 0,
      gemellaggio: profile.gemellaggio + gemellaggioDelta
    });

  } catch (err) {
    console.error('Chat error:', err);
    res.status(500).json({ error: 'Errore nella chat. Riprova.' });
  }
});

// Manual learn endpoint
router.post('/learn', async (req, res) => {
  try {
    const { profileId } = req.body;
    if (!profileId) return res.status(400).json({ error: 'profileId richiesto' });

    const { data: profile } = await supabase.from('profiles').select('*').eq('id', profileId).single();
    const { data: memory } = await supabase.from('chat_memory').select('*').eq('profile_id', profileId).single();

    const { data: recentChats } = await supabase
      .from('chat_history')
      .select('role, content, created_at')
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

    await supabase.from('profiles').update({ gemellaggio: newGem, last_learned_at: new Date().toISOString() }).eq('id', profileId);

    res.json({ updated: true, learnings: result.learnings, gemellaggio: newGem });

  } catch (err) {
    console.error('Learn error:', err);
    res.status(500).json({ error: 'Errore aggiornamento.' });
  }
});

module.exports = router;
