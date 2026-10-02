// Envoie en push les notifications en attente. Appelée chaque minute par pg_cron (voir README).
// Protégée par l'en-tête x-cron-secret (secret CRON_SECRET), pas par un jeton utilisateur.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { sendPush } from '../_shared/webpush.ts';
import { cors } from '../_shared/cors.ts';

Deno.serve(async (req) => {
  // GET public : l'appli récupère la clé publique VAPID (rien de secret)
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method === 'GET') return Response.json({ publicKey: Deno.env.get('VAPID_PUBLIC_KEY') || '' }, { headers: { ...cors, 'Cache-Control': 'public, max-age=3600' } });
  if (req.headers.get('x-cron-secret') !== Deno.env.get('CRON_SECRET')) return new Response('interdit', { status: 401 });
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const vapid = { publicKey: Deno.env.get('VAPID_PUBLIC_KEY')!, privateKey: Deno.env.get('VAPID_PRIVATE_KEY')!, subject: Deno.env.get('VAPID_SUBJECT') || Deno.env.get('APP_URL') || 'https://victor0904.github.io/Bestiaire/' };
  const since = new Date(Date.now() - 6 * 3600_000).toISOString();
  const { data: notes, error } = await db.from('notifications').select('id,user_id,title,body,tab,kind').is('sent_at', null).gte('created_at', since).order('created_at').limit(300);
  if (error) return new Response(error.message, { status: 500 });
  if (!notes?.length) return Response.json({ sent: 0 });
  const users = [...new Set(notes.map(n => n.user_id))];
  const { data: subs } = await db.from('push_subscriptions').select('endpoint,user_id,p256dh,auth').in('user_id', users);
  let sent = 0; const dead: string[] = [];
  for (const n of notes) {
    for (const s of (subs || []).filter(x => x.user_id === n.user_id)) {
      try {
        const code = await sendPush(s, { title: n.title, body: n.body, tab: n.tab, tag: n.kind }, vapid);
        if (code === 404 || code === 410) dead.push(s.endpoint); else if (code < 300) sent++;
      } catch { /* réseau : on n'insiste pas */ }
    }
  }
  await db.from('notifications').update({ sent_at: new Date().toISOString() }).in('id', notes.map(n => n.id));
  if (dead.length) await db.from('push_subscriptions').delete().in('endpoint', dead);
  return Response.json({ sent, notifications: notes.length, expired: dead.length });
});
