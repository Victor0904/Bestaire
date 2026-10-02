import { supabase } from './supabase';

export interface Quest { t: string; b?: string; c?: string; goal: number; prog: number; claimed: boolean; rw: { plumes?: number; films?: number }; premium?: boolean }
export interface GameState {
  pseudo: string | null; tz: string; plumes: number; films: number; next_film_at: string | null; film_cap: number; film_minutes: number;
  premium: boolean; premium_until: string | null; rating: number; wins: number; losses: number; duel_w: number; duel_l: number;
  quests: Quest[]; wishes: string[]; phase: string; month: number; daily_biome: string; server_time: string;
}
export interface Card { id: number; species_id: string; q: number; lvl: number; biome: string | null; phase: string | null; status: 'owned' | 'auction'; created_at?: string }
export interface Shot { id: number; species_id: string; q: number; lvl: number; biome: string; phase: string; is_new: boolean }
export interface FuseResult { id: number; species_id: string; q: number; lvl: number; up: boolean; a: { q: number; lvl: number }; b: { q: number; lvl: number } }
export interface Auction { id: number; seller: string; card_id: number; species_id: string; q: number; lvl: number; start_price: number; buy_now: number | null; ends_at: string; status: string; best_bid: number | null; best_bidder: string | null; bids: number }
export interface BotOffer { id: number; species_id: string; q: number; lvl: number; price: number; seller: string; pays: string; expires_at: string }
export interface Sale { species_id: string; lvl: number; q: number; price: number; at: string }
export interface Defense { owner: string; team: { species_id: string; lvl: number; q: number }[]; rating: number; pseudo: string | null; updated_at: string }

/** Message d'erreur lisible (les fonctions serveur renvoient des messages en français) */
export const errMsg = (e: unknown) => (e && typeof e === 'object' && 'message' in e ? String((e as { message: string }).message) : 'Une erreur est survenue');

async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw error;
  return data as T;
}

export const api = {
  state: () => rpc<GameState>('get_state'),
  shoot: (biome: string) => rpc<Shot[]>('safari_shoot', { p_biome: biome }),
  fuse: (species: string, lvl: number) => rpc<FuseResult>('fuse', { p_species: species, p_lvl: lvl }),
  quickSell: (card: number) => rpc<number>('quick_sell', { p_card: card }),
  listAuction: (card: number, start: number, buyNow: number | null, minutes: number) => rpc<number>('list_auction', { p_card: card, p_start: start, p_buy_now: buyNow, p_minutes: minutes }),
  bid: (auction: number, amount: number) => rpc<{ bought: boolean; amount: number }>('place_bid', { p_auction: auction, p_amount: amount }),
  botOffers: () => rpc<BotOffer[]>('get_bot_offers'),
  buyOffer: (offer: number) => rpc<number>('buy_bot_offer', { p_offer: offer }),
  claimQuest: (i: number) => rpc<{ plumes?: number; films?: number }>('claim_quest', { p_index: i }),
  battleReward: (won: boolean, foes: string[], lvls: number[]) => rpc<{ gain: number; bonus: boolean; cap?: boolean }>('battle_reward', { p_won: won, p_foes: foes, p_lvls: lvls }),
  saveDefense: (cards: number[]) => rpc<void>('save_defense', { p_cards: cards }),
  recordDuel: (defender: string, won: boolean) => rpc<{ delta: number; gain: number; rating: number }>('record_duel', { p_defender: defender, p_won: won }),

  async cards(): Promise<Card[]> {
    const all: Card[] = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await supabase.from('cards').select('id,species_id,q,lvl,biome,phase,status,created_at').order('id').range(from, from + 999);
      if (error) throw error; all.push(...(data as Card[])); if (!data || data.length < 1000) break;
    }
    return all;
  },
  async auctions(): Promise<Auction[]> {
    const { data, error } = await supabase.from('auctions').select('*').eq('status', 'open').order('ends_at', { ascending: true }).limit(200);
    if (error) throw error; return data as Auction[];
  },
  async sales(): Promise<Sale[]> {
    const { data, error } = await supabase.from('sales').select('species_id,lvl,q,price,at').order('at', { ascending: false }).limit(500);
    if (error) throw error; return data as Sale[];
  },
  async defenses(): Promise<Defense[]> {
    const { data, error } = await supabase.from('defenses').select('*').order('rating', { ascending: false }).limit(200);
    if (error) throw error; return data as Defense[];
  },
  async setProfile(uid: string, patch: { pseudo?: string; wishes?: string[]; tz?: string }) {
    const { error } = await supabase.from('profiles').update(patch).eq('id', uid);
    if (error) throw error;
  },
  /** Abonnement : ouvre le paiement Stripe (fonction serveur create-checkout) */
  async checkout(): Promise<string> {
    const { data, error } = await supabase.functions.invoke('create-checkout', { body: { return_url: location.origin + location.pathname } });
    if (error) throw error; return (data as { url: string }).url;
  },
  async portal(): Promise<string> {
    const { data, error } = await supabase.functions.invoke('customer-portal', { body: { return_url: location.origin + location.pathname } });
    if (error) throw error; return (data as { url: string }).url;
  },
};
