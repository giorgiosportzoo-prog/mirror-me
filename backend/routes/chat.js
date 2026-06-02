const express = require('express');
const Anthropic = require('@anthropic-ai/sdk');
const supabase = require('../supabase');

const router = express.Router();
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

router.post('/', async (req, res) => {
  try {
    const { profileId, message, history } = req.body;
    if (!profileId || !message) return res.status(400).json({ error: 'profileId e message richiesti' });

    const { data: profile, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', profileId)
      .single();
    if (error || !profile) return res.status(404).json({ error: 'Profilo non trovato' });

    const messages = [
      ...(history || []).map(m => ({ role: m.role, content: m.content })),
      { role: 'user', content: message }
    ];

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 500,
      system: profile.system_prompt + '\n\nRicorda tutto ciò che è stato detto in questa conversazione e sii coerente.',
      messages
    });

    const reply = response.content[0].text;

    // Save messages to chat_history
    await supabase.from('chat_history').insert([
      { profile_id: profileId, role: 'user', content: message },
      { profile_id: profileId, role: 'assistant', content: reply }
    ]);

    const totalMessages = (history || []).length + 2;

    res.json({ reply, totalMessages });

  } catch (err) {
    console.error('Chat error:', err);
    res.status(500).json({ error: 'Errore nella chat. Riprova.' });
  }
});

// Daily learning endpoint — call once a day or on demand
router.post('/learn', async (req, res) => {
  try {
    const { profileId } = req.body;
    if (!profileId) return res.status(400).json({ error: 'profileId richiesto' });

    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', profileId)
      .single();

    const { data: recentChats } = await supabase
      .from('chat_history')
      .select('role, content, created_at')
      .eq('profile_id', profileId)
      .gte('created_at', profile.last_learned_at)
      .order('created_at', { ascending: true });

    if (!recentChats || recentChats.length < 4) {
      return res.json({ updated: false, reason: 'Troppo pochi scambi dall\'ultimo aggiornamento' });
    }

    const chatText = recentChats.map(m => `${m.role === 'user' ? 'Utente' : 'Gemello'}: ${m.content}`).join('\n');
    const currentProfile = profile.profile_json;

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1200,
      system: `Sei un esperto di linguistica. Dato un profilo esistente e nuovi scambi conversazionali, aggiorna il profilo con ciò che hai imparato. Restituisci SOLO JSON valido con la stessa struttura del profilo originale. Il gemellaggio può salire al massimo di 3 punti per aggiornamento. Non superare mai 88.`,
      messages: [{
        role: 'user',
        content: `Profilo attuale:\n${JSON.stringify(currentProfile, null, 2)}\n\nNuovi scambi:\n${chatText}\n\nAggiorna il profilo con ciò che hai imparato.`
      }]
    });

    const raw = message.content[0].text.replace(/```json|```/g, '').trim();
    const updatedProfile = JSON.parse(raw);
    const newGem = Math.min(88, Math.max(currentProfile.gemellaggio, updatedProfile.gemellaggio));
    updatedProfile.gemellaggio = newGem;

    await supabase
      .from('profiles')
      .update({
        profile_json: updatedProfile,
        system_prompt: updatedProfile.systemPrompt,
        gemellaggio: newGem,
        last_learned_at: new Date().toISOString()
      })
      .eq('id', profileId);

    res.json({ updated: true, profile: updatedProfile, gemellaggio: newGem });

  } catch (err) {
    console.error('Learn error:', err);
    res.status(500).json({ error: 'Errore durante l\'aggiornamento.' });
  }
});

module.exports = router;
