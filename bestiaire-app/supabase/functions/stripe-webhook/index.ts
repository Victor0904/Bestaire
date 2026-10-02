// Reçoit les événements Stripe et met à jour premium_until (seul chemin pour activer le premium).
// Secrets requis : STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET. Déployer avec --no-verify-jwt (Stripe n'a pas de jeton Supabase).
import Stripe from 'npm:stripe@17';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { HANDLED, customerId, premiumUntil, SubLike } from '../_shared/premium.ts';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, { httpClient: Stripe.createFetchHttpClient() });
const crypto = Stripe.createSubtleCryptoProvider();

Deno.serve(async (req) => {
  const sig = req.headers.get('Stripe-Signature');
  const body = await req.text();
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(body, sig!, Deno.env.get('STRIPE_WEBHOOK_SECRET')!, undefined, crypto);
  } catch (e) {
    console.error('signature invalide', e); return new Response('signature invalide', { status: 400 });
  }
  if (!HANDLED.includes(event.type)) return new Response('ignoré', { status: 200 });
  const sub = event.data.object as unknown as SubLike;
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const until = premiumUntil(sub);
  const uid = sub.metadata?.user_id;
  const q = admin.from('profiles').update({ premium_until: until, stripe_customer: customerId(sub) });
  const { error } = uid ? await q.eq('id', uid) : await q.eq('stripe_customer', customerId(sub));
  if (error) { console.error(error); return new Response('erreur base', { status: 500 }) }
  return new Response('ok', { status: 200 });
});
