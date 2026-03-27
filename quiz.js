const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

async function sb(path, method='GET', body=null) {
  const opts = {
    method,
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': 'Bearer ' + SUPABASE_KEY,
      'Content-Type': 'application/json',
      'Prefer': method === 'POST' ? 'resolution=merge-duplicates,return=representation' : 'return=representation'
    }
  };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(SUPABASE_URL + '/rest/v1/' + path, opts);
  return r.json();
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { user_id, quiz_number, score } = req.body || req.query;
  if (!user_id || !quiz_number) return res.status(400).json({ error: 'Missing params' });

  try {
    const uid = parseInt(user_id);
    const qnum = parseInt(quiz_number);
    const sc = parseInt(score) || 0;
    const today = new Date().toISOString().split('T')[0];
    const XP_PER_CORRECT = 50;

    // Check if already done today
    const existing = await sb(`quiz_attempts?user_id=eq.${uid}&quiz_number=eq.${qnum}&day_key=eq.${today}`);
    if (existing.length > 0) {
      return res.status(400).json({ ok: false, error: 'Quiz já realizado hoje' });
    }

    // Save attempt
    await sb('quiz_attempts', 'POST', {
      user_id: uid,
      quiz_number: qnum,
      score: sc,
      day_key: today
    });

    // Add XP
    const xpEarned = sc * XP_PER_CORRECT;
    if (xpEarned > 0) {
      const users = await sb(`users?id=eq.${uid}`);
      if (users[0]) {
        await sb(`users?id=eq.${uid}`, 'PATCH', {
          xp: (users[0].xp || 0) + xpEarned,
          xp_quiz: (users[0].xp_quiz || 0) + xpEarned
        });
      }
    }

    res.status(200).json({ ok: true, xp_earned: xpEarned });

  } catch(e) {
    res.status(500).json({ ok: false, error: e.message });
  }
}
