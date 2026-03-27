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
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { user_id, first_name, username, last_name, ref } = req.query;
  if (!user_id) return res.status(400).json({ error: 'user_id required' });

  try {
    const uid = parseInt(user_id);
    const today = new Date().toISOString().split('T')[0];

    // Get or create user
    let users = await sb(`users?id=eq.${uid}`);
    let user = users[0];

    if (!user) {
      // New user — create and give XP to inviter
      const newUser = {
        id: uid,
        first_name: first_name || 'User',
        last_name: last_name || '',
        username: username || '',
        xp: 0,
        streak: 1,
        last_seen: today,
        last_streak_date: today,
        invited_by: ref ? parseInt(ref) : null
      };
      const created = await sb('users', 'POST', newUser);
      user = created[0] || newUser;

      // Give XP to inviter
      if (ref) {
        const inviterId = parseInt(ref);
        const XP_PER_INVITE = 200;
        await sb('users?id=eq.' + inviterId, 'PATCH', {
          xp: undefined,
          invite_count: undefined
        });
        // Increment via RPC not available, use raw update with current values
        const inviter = await sb('users?id=eq.' + inviterId);
        if (inviter[0]) {
          await sb('users?id=eq.' + inviterId, 'PATCH', {
            xp: (inviter[0].xp || 0) + XP_PER_INVITE,
            xp_invites: (inviter[0].xp_invites || 0) + XP_PER_INVITE,
            invite_count: (inviter[0].invite_count || 0) + 1
          });
          // Register invite
          await sb('invites', 'POST', { inviter_id: inviterId, invitee_id: uid });
        }
      }
    } else {
      // Update streak
      let streak = user.streak || 1;
      const lastStreak = user.last_streak_date;
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = yesterday.toISOString().split('T')[0];

      if (lastStreak === yesterdayStr) {
        streak += 1;
      } else if (lastStreak !== today) {
        streak = 1;
      }

      const streakXP = streak >= 7 ? 50 : streak >= 3 ? 20 : 0;
      const updates = {
        first_name: first_name || user.first_name,
        username: username || user.username,
        last_seen: today,
        last_streak_date: today,
        streak,
      };
      if (lastStreak !== today && streakXP > 0) {
        updates.xp = (user.xp || 0) + streakXP;
        updates.xp_streak = (user.xp_streak || 0) + streakXP;
      }
      await sb('users?id=eq.' + uid, 'PATCH', updates);
      user = { ...user, ...updates };
    }

    // Get quiz attempts today
    const attempts = await sb(`quiz_attempts?user_id=eq.${uid}&day_key=eq.${today}`);
    const quizDone = { 1: false, 2: false };
    attempts.forEach(a => { quizDone[a.quiz_number] = true; });

    // Get ranking
    const ranking = await sb('weekly_ranking?limit=20');
    const myRank = ranking.find(r => r.id === uid);

    res.status(200).json({
      ok: true,
      user,
      quiz_done: quizDone,
      rank: myRank ? myRank.position : null,
      ranking: ranking.slice(0, 10)
    });

  } catch(e) {
    res.status(500).json({ ok: false, error: e.message });
  }
}
