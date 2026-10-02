// Ouvre l'espace client Stripe (changer de carte, résilier l'abonnement).
import Stripe from 'npm:stripe@17';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { cors, json } from '../_shared/cors.ts';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, { httpClient: Stripe.createFetchHttpClient() });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } });
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return json({ error: 'non connecté' }, 401);
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: prof } = await admin.from('profiles').select('stripe_customer').eq('id', user.id).single();
    if (!prof?.stripe_customer) return json({ error: "aucun abonnement" }, 404);
    const { return_url } = await req.json().catch(() => ({ return_url: '' }));
    const s = await stripe.billingPortal.sessions.create({ customer: prof.stripe_customer, return_url: String(return_url || Deno.env.get('APP_URL') || ''), locale: 'fr' });
    return json({ url: s.url });
  } catch (e) {
    console.error(e); return json({ error: 'espace client indisponible' }, 500);
  }
});
