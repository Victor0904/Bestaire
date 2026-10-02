// Crée une session de paiement Stripe pour l'abonnement Bestiaire+ (4,99 €/mois).
// Secrets requis : STRIPE_SECRET_KEY, STRIPE_PRICE_ID (+ SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY fournis par Supabase)
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
    let customer = prof?.stripe_customer as string | null;
    if (!customer) {
      const c = await stripe.customers.create({ email: user.email ?? undefined, metadata: { user_id: user.id } });
      customer = c.id;
      await admin.from('profiles').update({ stripe_customer: customer }).eq('id', user.id);
    }
    const { return_url } = await req.json().catch(() => ({ return_url: '' }));
    const back = String(return_url || Deno.env.get('APP_URL') || '');
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription', customer,
      line_items: [{ price: Deno.env.get('STRIPE_PRICE_ID')!, quantity: 1 }],
      client_reference_id: user.id,
      subscription_data: { metadata: { user_id: user.id } },
      success_url: `${back}?abonnement=ok`, cancel_url: `${back}?abonnement=annule`,
      locale: 'fr', allow_promotion_codes: true,
    });
    return json({ url: session.url });
  } catch (e) {
    console.error(e); return json({ error: 'paiement indisponible pour le moment' }, 500);
  }
});
