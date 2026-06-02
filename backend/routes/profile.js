const express = require('express');
const supabase = require('../supabase');

const router = express.Router();

router.get('/:id', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', req.params.id)
      .single();
    if (error) return res.status(404).json({ error: 'Profilo non trovato' });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Errore.' });
  }
});

router.get('/session/:sessionId', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('session_id', req.params.sessionId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    if (error) return res.status(404).json({ error: 'Nessun profilo trovato' });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Errore.' });
  }
});

module.exports = router;
