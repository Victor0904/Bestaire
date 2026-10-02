// Logique pure de l'abonnement (testée avec Vitest, utilisée par la fonction stripe-webhook).
export interface SubLike {
  status: string;
  current_period_end?: number | null;
  items?: { data?: { current_period_end?: number | null }[] };
  metadata?: Record<string, string>;
  customer: string | { id: string };
}
const ACTIVE = new Set(['active', 'trialing', 'past_due']); // past_due : Stripe réessaie le paiement, on laisse quelques jours

/** Date de fin du premium à enregistrer pour un abonnement Stripe (null = pas de premium) */
export function premiumUntil(sub: SubLike, now = Date.now()): string | null {
  if (!ACTIVE.has(sub.status)) return new Date(now).toISOString();
  const end = sub.current_period_end ?? sub.items?.data?.[0]?.current_period_end ?? null;
  if (!end) return null;
  // marge de 2 jours pour laisser à Stripe le temps de renouveler
  return new Date(end * 1000 + 2 * 86400_000).toISOString();
}
export const customerId = (sub: SubLike) => (typeof sub.customer === 'string' ? sub.customer : sub.customer.id);
export const HANDLED = ['customer.subscription.created', 'customer.subscription.updated', 'customer.subscription.deleted'];
