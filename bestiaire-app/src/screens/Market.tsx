import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BYID, cote } from '../game/species';
import { api, Auction, BotOffer, Sale } from '../lib/api';
import { supabase } from '../lib/supabase';
import { useGame } from '../lib/store';
import { fmtLeft } from '../lib/fx';
import { Print, Sheet } from '../components/ui';

export function Market() {
  const { state, uid, run, toast, refresh, refreshCards } = useGame();
  const [auctions, setAuctions] = useState<Auction[]>([]); const [offers, setOffers] = useState<BotOffer[]>([]); const [sales, setSales] = useState<Sale[]>([]);
  const [bid, setBid] = useState<Auction | null>(null); const [, tick] = useState(0);
  const seen = useRef(new Set<number>());
  const load = useCallback(async () => {
    const [a, o, s] = await Promise.all([api.auctions().catch(() => []), api.botOffers().catch(() => []), api.sales().catch(() => [])]);
    setAuctions(a); setOffers(o); setSales(s);
  }, []);
  useEffect(() => {
    load(); const t = setInterval(() => { load(); tick(x => x + 1) }, 15_000);
    const ch = supabase.channel('marche').on('postgres_changes', { event: '*', schema: 'public', table: 'auctions' }, () => load()).subscribe();
    return () => { clearInterval(t); supabase.removeChannel(ch) };
  }, [load]);
  useEffect(() => { // alerte liste de souhaits
    const w = new Set(state?.wishes || []);
    for (const a of auctions) if (w.has(a.species_id) && a.seller !== uid && !seen.current.has(a.id)) { seen.current.add(a.id); toast(`Liste de souhaits : ${BYID[a.species_id]?.nom} est aux enchères !`) }
  }, [auctions, state?.wishes, uid, toast]);
  const stats = useMemo(() => { const m: Record<string, { n: number; sum: number; last: number }> = {}; for (const s of sales) { const x = (m[s.species_id] ||= { n: 0, sum: 0, last: s.price }); x.n++; x.sum += s.price } return m }, [sales]);
  const now = Date.now(); const open = auctions.filter(a => new Date(a.ends_at).getTime() > now && BYID[a.species_id]);
  const mine = open.filter(a => a.seller === uid), others = open.filter(a => a.seller !== uid);
  const minNext = (a: Auction) => a.best_bid == null ? a.start_price : Math.ceil(a.best_bid * 1.05);
  const card = (a: Auction) => { const s = BYID[a.species_id], ps = stats[a.species_id], lead = a.best_bidder === uid;
    return <div key={a.id} className="offer"><Print s={s} q={a.q} lvl={a.lvl} foot={<span className="copies">{a.seller === uid ? 'ta vente' : 'joueur'}</span>} />
      <div className="bidinfo"><b>{a.best_bid ?? a.start_price} plumes</b><span className="note">{a.best_bid ? `${a.bids} enchère${a.bids > 1 ? 's' : ''} · ${lead ? 'tu mènes' : 'un autre joueur mène'}` : 'mise de départ'} · {fmtLeft(new Date(a.ends_at).getTime() - now)}</span>
        {ps && <span className="note">Marché : moy. {Math.round(ps.sum / ps.n)}, dernière {ps.last} ({ps.n} vente{ps.n > 1 ? 's' : ''})</span>}</div>
      {a.seller !== uid && <div className="row" style={{ gap: 6 }}><button className={`btn ${lead ? '' : 'primary'}`} onClick={() => setBid(a)}>{lead ? 'Relancer' : 'Enchérir'} {minNext(a)}</button>
        {a.buy_now && (!a.best_bid || a.best_bid < a.buy_now) && <button className="btn" onClick={async () => { const r = await run(api.bid(a.id, a.buy_now!)); if (r) { toast('Achat immédiat effectué'); load(); refresh(); refreshCards() } }}>Achat immédiat {a.buy_now}</button>}</div>}
    </div> };
  return (
    <section className="view">
      <div className="row spread"><h2>Marché</h2><span className="note">{state?.plumes ?? 0} plumes disponibles</span></div>
      <div className="panel"><div className="row spread"><p className="eyebrow">Enchères des joueurs</p><span className="note">{others.length} en cours</span></div>
        {others.length ? <div className="grid">{others.map(card)}</div> : <p className="note">Aucune enchère d'autres joueurs pour l'instant.</p>}</div>
      <div className="panel"><p className="eyebrow">Tes ventes</p>{mine.length ? <div className="grid">{mine.map(card)}</div> : <p className="note">Aucune vente en cours. Ouvre la fiche d'un animal de ton bestiaire, puis « Vendre ».</p>}</div>
      <div className="panel"><p className="eyebrow">Collectionneurs · prix fixe</p>
        <div className="grid">{offers.filter(o => BYID[o.species_id]).map(o => <div key={o.id} className="offer"><Print s={BYID[o.species_id]} q={o.q} lvl={o.lvl} foot={<span className="copies">{o.seller} · {o.pays}</span>} />
          <button className={`btn ${(state?.plumes ?? 0) >= o.price ? 'primary' : ''}`} disabled={(state?.plumes ?? 0) < o.price} onClick={async () => { const r = await run(api.buyOffer(o.id)); if (r) { toast(`${BYID[o.species_id].nom} ajouté à ton bestiaire`); load(); refresh(); refreshCards() } }}>Acheter {o.price} plumes</button></div>)}</div></div>
      <details className="panel rules"><summary>Règles du marché</summary>
        <p>Le vendeur fixe une mise de départ, une durée et, s'il le veut, un prix d'achat immédiat.</p>
        <p>Chaque enchère doit dépasser la précédente d'au moins 5 %. Tes plumes sont bloquées tant que tu mènes, et rendues automatiquement si quelqu'un te dépasse.</p>
        <p>Une enchère placée dans les 2 dernières minutes prolonge la vente de 2 minutes.</p>
        <p>Sans enchère, un collectionneur peut racheter l'animal au prix de départ s'il est raisonnable ; sinon l'animal revient au vendeur.</p>
        <p>Les espèces du monde ont une cote ×1,5.</p></details>
      {bid && <BidSheet a={bid} min={minNext(bid)} onClose={() => setBid(null)} onDone={() => { setBid(null); load(); refresh(); refreshCards() }} />}
    </section>
  );
}
function BidSheet({ a, min, onClose, onDone }: { a: Auction; min: number; onClose: () => void; onDone: () => void }) {
  const { run, toast, state } = useGame(); const s = BYID[a.species_id]; const [v, setV] = useState(String(min));
  return <Sheet onClose={onClose} label={`Enchérir sur ${s.nom}`}><h2>Enchérir : {s.nom}</h2><Print s={s} q={a.q} lvl={a.lvl} />
    <p className="note">Cote {cote(s, a.lvl, a.q)} plumes · minimum {min} · tu as {state?.plumes ?? 0} plumes</p>
    <label className="field">Ton offre (plumes)<input type="number" min={min} value={v} onChange={e => setV(e.target.value)} /></label>
    <div className="row"><button className="btn primary" onClick={async () => { const r = await run(api.bid(a.id, Math.floor(+v))); if (r) { toast(r.bought ? 'Achat immédiat effectué' : `Enchère placée : ${r.amount} plumes`); onDone() } }}>Enchérir</button><button className="btn" onClick={onClose}>Annuler</button></div></Sheet>;
}
