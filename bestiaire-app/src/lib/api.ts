import { supabase } from './supabase';

export interface Quest { t: string; b?: string; c?: string; goal: number; prog: number; claimed: boolean; rw: { plumes?: number; films?: number }; premium?: boolean }
export interface GameState {
  pseudo: string | null; tz: string; plumes: number; films: number; next_film_at: string | null; film_cap: number; film_minutes: number;
  premium: boolean; premium_until: string | null; rating: number; wins: number; losses: number; duel_w: number; duel_l: number;
  quests: Quest[]; wishes: string[]; phase: string; month: number; daily_biome: string; server_time: string;
  onboarded: boolean; achievements: string[]; is_admin?: boolean; muted_until?: string | null; notif?: NotifPrefs | null;
}
export type NotifKind = 'pellicules' | 'encheres' | 'amis' | 'guilde' | 'duels';
export type NotifPrefs = Record<NotifKind, boolean>;
export interface Notif { id: number; kind: NotifKind; title: string; body: string; tab: string | null; created_at: string; read_at: string | null }
export type ReportReason = 'insulte' | 'harcelement' | 'haine' | 'sexuel' | 'spam' | 'autre';
export interface AdminReport { kind: 'message' | 'pseudo' | 'guilde'; ref: string; excerpt: string; target_user: string | null; target: string | null; n: number; reasons: ReportReason[]; last: string; muted_until: string | null }
export interface Achievement { code: string; goal: number; prog: number; plumes: number; films: number; claimed: boolean }
export interface Friend { id: string; pseudo: string; status: 'pending' | 'accepted'; incoming: boolean; species: number; rating: number; last_seen: string | null; guild: string | null; defense: boolean }
export interface FriendProfile { id: string; pseudo: string | null; rating: number; wins: number; duel_w: number; achievements: number; metrics: Record<string, number>; top: { species_id: string; q: number; lvl: number; phase: string | null; tier: number }[] }
export interface GuildSummary { id: number; name: string; tag: string; descr: string; emblem: string | null; open: boolean; n: number; rating: number | null }
export interface GuildMember { id: string; pseudo: string; role: 'chef' | 'officier' | 'membre'; rating: number; species: number; week: number; last_seen: string | null }
export interface GuildMessage { id: number; user_id: string | null; pseudo: string | null; body: string; at: string }
export interface Guild { id: number; name: string; tag: string; descr: string; emblem: string | null; open: boolean; role: GuildMember['role']; claimed: boolean | null; week: { photos: number; goal: number; members: number }; members: GuildMember[]; messages: GuildMessage[] }
export interface Card { id: number; species_id: string; q: number; lvl: number; xp?: number; biome: string | null; phase: string | null; status: 'owned' | 'auction'; created_at?: string }
export interface Shot { id: number; species_id: string; q: number; lvl: number; biome: string; phase: string; is_new: boolean }
export interface FuseResult { id: number; species_id: string; q: number; lvl: number; up: boolean; a: { q: number; lvl: number }; b: { q: number; lvl: number } }
export interface Auction { id: number; seller: string; card_id: number; species_id: string; q: number; lvl: number; start_price: number; buy_now: number | null; ends_at: string; status: string; best_bid: number | null; best_bidder: string | null; bids: number }
export interface BotOffer { id: number; species_id: string; q: number; lvl: number; price: number; seller: string; pays: string; expires_at: string }
export interface Sale { species_id: string; lvl: number; q: number; price: number; at: string }
export interface Defense { owner: string; team: { species_id: string; lvl: number; q: number; niv?: number }[]; rating: number; pseudo: string | null; updated_at: string }

export interface CompagnonRow { owner: string; pseudo: string | null; espece: string; surnom: string | null; niveau: number; rating: number; data: unknown; updated_at: string }
export interface XpResult { cap: boolean; cards: { id: number; xp: number; niv: number; avant: number }[] }
export interface AdvResult { stars: number; first?: boolean; plumes: number; film: boolean; xp: XpResult; adv: Record<string, number> }

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
  battleXp: (cards: number[], won: boolean) => rpc<XpResult>('battle_xp', { p_cards: cards, p_won: won }),
  adventureState: () => rpc<{ adv: Record<string, number>; xp_count: number }>('adventure_state'),
  adventureWin: (stage: number, won: boolean, stars: number, cards: number[]) => rpc<AdvResult>('adventure_win', { p_stage: stage, p_won: won, p_stars: stars, p_cards: cards }),
  achievements: () => rpc<Achievement[]>('get_achievements'),
  claimAchievement: (code: string) => rpc<{ plumes: number; films: number }>('claim_achievement', { p_code: code }),
  friends: () => rpc<{ code: string; list: Friend[] }>('get_friends'),
  friendRequest: (code: string) => rpc<string>('friend_request', { p_code: code }),
  friendRespond: (other: string, accept: boolean) => rpc<void>('friend_respond', { p_other: other, p_accept: accept }),
  friendRemove: (other: string) => rpc<void>('friend_remove', { p_other: other }),
  friendProfile: (other: string) => rpc<FriendProfile>('friend_profile', { p_other: other }),
  guildList: (q = '') => rpc<GuildSummary[]>('guild_list', { p_q: q }),
  guildCreate: (name: string, tag: string, descr: string, emblem: string | null) => rpc<number>('guild_create', { p_name: name, p_tag: tag, p_descr: descr, p_emblem: emblem }),
  guildJoin: (id: number) => rpc<void>('guild_join', { p_gid: id }),
  guildLeave: () => rpc<void>('guild_leave'),
  guildManage: (user: string, action: 'exclure' | 'promouvoir' | 'retrograder' | 'chef') => rpc<void>('guild_manage', { p_user: user, p_action: action }),
  guildUpdate: (descr: string, open: boolean) => rpc<void>('guild_update', { p_descr: descr, p_open: open }),
  guildPost: (body: string) => rpc<void>('guild_post', { p_body: body }),
  guildClaim: () => rpc<{ plumes: number; films: number }>('guild_claim_week'),
  guildGet: () => rpc<Guild | null>('guild_get'),
  deleteAccount: () => rpc<void>('delete_my_account'),
  notifications: () => rpc<{ unread: number; list: Notif[]; prefs: NotifPrefs | null; push: number }>('get_notifications'),
  markRead: () => rpc<void>('mark_notifications_read'),
  setNotifPrefs: (prefs: Partial<NotifPrefs>) => rpc<void>('set_notif_prefs', { p_prefs: prefs }),
  pushSubscribe: (endpoint: string, p256dh: string, auth: string) => rpc<void>('push_subscribe', { p_endpoint: endpoint, p_p256dh: p256dh, p_auth: auth }),
  pushUnsubscribe: (endpoint: string) => rpc<void>('push_unsubscribe', { p_endpoint: endpoint }),
  report: (kind: 'message' | 'pseudo' | 'guilde', ref: string, reason: ReportReason) => rpc<string>('report', { p_kind: kind, p_ref: ref, p_reason: reason }),
  block: (other: string, on: boolean) => rpc<void>('block_user', { p_other: other, p_on: on }),
  myBlocks: () => rpc<{ id: string; pseudo: string }[]>('my_blocks'),
  adminReports: () => rpc<AdminReport[]>('admin_reports'),
  adminAct: (kind: string, ref: string, action: 'ignorer' | 'masquer' | 'pseudo' | 'guilde' | 'muet' | 'bannir') => rpc<void>('admin_act', { p_kind: kind, p_ref: ref, p_action: action }),
  async defenseOf(owner: string): Promise<Defense | null> {
    const { data, error } = await supabase.from('defenses').select('*').eq('owner', owner).maybeSingle();
    if (error) throw error; return data as Defense | null;
  },
  recordDuel: (defender: string, won: boolean) => rpc<{ delta: number; gain: number; rating: number }>('record_duel', { p_defender: defender, p_won: won }),

  async cards(): Promise<Card[]> {
    const all: Card[] = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await supabase.from('cards').select('id,species_id,q,lvl,xp,biome,phase,status,created_at').order('id').range(from, from + 999);
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
  // Mode Compagnon (test)
  compagnonSave: (espece: string, surnom: string, niveau: number, data: unknown) => rpc<void>('compagnon_save', { p_espece: espece, p_surnom: surnom, p_niveau: niveau, p_data: data }),
  compagnonDuel: (def: string, won: boolean) => rpc<{ delta: number; rating: number }>('compagnon_duel', { p_def: def, p_won: won }),
  async compagnonMien(uid: string): Promise<CompagnonRow | null> {
    const { data, error } = await supabase.from('compagnons').select('*').eq('owner', uid).maybeSingle();
    if (error) throw error; return data as CompagnonRow | null;
  },
  async compagnons(): Promise<CompagnonRow[]> {
    const { data, error } = await supabase.from('compagnons').select('*').order('rating', { ascending: false }).limit(100);
    if (error) throw error; return (data || []) as CompagnonRow[];
  },
  async defenses(): Promise<Defense[]> {
    const { data, error } = await supabase.from('defenses').select('*').order('rating', { ascending: false }).limit(200);
    if (error) throw error; return data as Defense[];
  },
  async setProfile(uid: string, patch: { pseudo?: string; wishes?: string[]; tz?: string; onboarded?: boolean }) {
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
