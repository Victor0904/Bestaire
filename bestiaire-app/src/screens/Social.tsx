import { useCallback, useEffect, useRef, useState } from 'react';
import { BYID, Species, photoStyle } from '../game/species';
import { ACH, GROUPS } from '../game/achievements';
import { api, Achievement, Friend, FriendProfile, Guild, GuildSummary } from '../lib/api';
import { supabase } from '../lib/supabase';
import { useGame } from '../lib/store';
import { buzz, confetti } from '../lib/fx';
import { Print, Sheet } from '../components/ui';
import { ReportSheet } from '../components/Moderation';

const ago = (iso: string | null) => {
  if (!iso) return 'jamais vu'; const m = Math.round((Date.now() - Date.parse(iso)) / 60000);
  return m < 5 ? 'en ligne' : m < 60 ? `il y a ${m} min` : m < 1440 ? `il y a ${Math.round(m / 60)} h` : `il y a ${Math.round(m / 1440)} j`;
};
const plural = (n: number, w: string) => `${n} ${w}${n > 1 ? 's' : ''}`;

// =====================================================================
// Succès
// =====================================================================
export function Achievements() {
  const { run, refresh, refreshSocial, toast } = useGame();
  const [list, setList] = useState<Achievement[] | null>(null);
  const host = useRef<HTMLDivElement>(null);
  const load = useCallback(() => api.achievements().then(setList).catch(() => setList([])), []);
  useEffect(() => { load() }, [load]);
  const claim = async (a: Achievement) => {
    const r = await run(api.claimAchievement(a.code)); if (!r) return;
    buzz([20, 30, 50]); confetti(host.current, ['#f0b54a', '#8fbf7f', '#ffffff'], 70, 0);
    toast(`${ACH[a.code]?.t || 'Succès'} : +${r.plumes ? r.plumes + ' plumes' : ''}${r.plumes && r.films ? ', ' : ''}${r.films ? '+' + plural(r.films, 'pellicule') : ''}`);
    load(); refresh(); refreshSocial();
  };
  if (!list) return <p className="note">Chargement…</p>;
  if (!list.length) return <div className="panel"><p className="note">Les succès arrivent bientôt : la base doit être mise à jour (voir README).</p></div>;
  const done = list.filter(a => a.claimed).length; const ready = list.filter(a => !a.claimed && a.prog >= a.goal);
  return (
    <div className="ach" ref={host} style={{ position: 'relative' }}>
      <div className="panel ach-head"><div><p className="eyebrow">Succès</p><h2>{done} / {list.length}</h2></div>
        <div className="bar" style={{ flex: 1 }}><i style={{ width: `${(100 * done) / list.length}%` }} /></div></div>
      {ready.length > 0 && <p className="note"><b>{plural(ready.length, 'récompense')} à récupérer !</b></p>}
      {GROUPS.map(g => { const items = list.filter(a => ACH[a.code]?.g === g).sort((a, b) => +(b.prog >= b.goal && !b.claimed) - +(a.prog >= a.goal && !a.claimed) || +a.claimed - +b.claimed || a.goal - b.goal);
        if (!items.length) return null;
        return <div key={g}><h3 className="ach-g">{g}</h3><div className="ach-list">{items.map(a => { const L = ACH[a.code] || { t: a.code, d: '', ic: '•' }; const can = !a.claimed && a.prog >= a.goal;
          return <div key={a.code} className={`achv ${a.claimed ? 'done' : can ? 'ready' : ''}`}>
            <span className="ai">{L.ic}</span>
            <div className="ab"><b>{L.t}</b><small>{L.d}</small>
              {!a.claimed && <span className="ap"><em><u style={{ width: `${(100 * a.prog) / a.goal}%` }} /></em><i>{a.prog}/{a.goal}</i></span>}</div>
            <div className="ar">{a.claimed ? <span className="ok">✓</span> : can ? <button className="btn primary small" onClick={() => claim(a)}>Récupérer</button>
              : <small>{a.plumes ? `${a.plumes} pl.` : ''}{a.plumes && a.films ? ' · ' : ''}{a.films ? `${a.films} pell.` : ''}</small>}</div>
          </div> })}</div></div> })}
    </div>
  );
}

// =====================================================================
// Profil d'un autre joueur (ami ou membre de la guilde)
// =====================================================================
export function PlayerSheet({ id, name, onClose, extra }: { id: string; name: string; onClose: () => void; extra?: React.ReactNode }) {
  const { run, setChallenge, go, toast } = useGame();
  const [p, setP] = useState<FriendProfile | null>(null); const [err, setErr] = useState(''); const [rep, setRep] = useState(false);
  const block = async () => { const r = await run(api.block(id, true).then(() => true)); if (r) { toast(`${name} est bloqué : tu ne verras plus ses messages`); onClose() } };
  useEffect(() => { api.friendProfile(id).then(setP).catch(e => setErr(e.message || 'Profil indisponible')) }, [id]);
  const duel = async () => { const d = await run(api.defenseOf(id)); if (!d) return toast(`${name} n'a pas encore d'équipe de défense`); setChallenge({ ...d, pseudo: name }); onClose(); go('battle') };
  const top = (p?.top || []).filter(x => BYID[x.species_id]).sort((a, b) => b.tier - a.tier || b.lvl - a.lvl || b.q - a.q).slice(0, 6);
  return (
    <Sheet onClose={onClose} label={name}>
      <h2>{name}</h2>
      {err ? <p className="note">{err}</p> : !p ? <p className="note">Chargement…</p> : <>
        <div className="pstats">
          <span><b>{p.metrics.species}</b>espèces</span><span><b>{p.metrics.legend}</b>légendaires</span><span><b>{p.rating}</b>classement</span><span><b>{p.achievements}</b>succès</span>
        </div>
        <p className="eyebrow">Ses plus belles cartes</p>
        {top.length ? <div className="grid small">{top.map(x => <div key={x.species_id} className="cell"><Print s={BYID[x.species_id]} q={x.q} lvl={x.lvl} phase={x.phase} /></div>)}</div> : <p className="note">Pas encore de carte.</p>}
        <div className="row"><button className="btn primary" onClick={duel}>Défier en duel</button>{extra}</div>
      </>}
      <div className="row modrow"><button className="linklike" onClick={() => setRep(true)}>Signaler le pseudo</button><button className="linklike" onClick={block}>Bloquer ce joueur</button></div>
      {rep && <ReportSheet kind="pseudo" refId={id} label={name} onClose={() => setRep(false)} />}
      <button className="btn" onClick={onClose}>Fermer</button>
    </Sheet>
  );
}

// =====================================================================
// Amis
// =====================================================================
export function Friends() {
  const { run, toast, refreshSocial } = useGame();
  const [data, setData] = useState<{ code: string; list: Friend[] } | null>(null);
  const [code, setCode] = useState(''); const [open, setOpen] = useState<Friend | null>(null);
  const load = useCallback(() => api.friends().then(setData).catch(() => setData({ code: '', list: [] })), []);
  useEffect(() => { load() }, [load]);
  const add = async () => { const c = code.trim().toUpperCase(); if (c.length !== 6) return toast('Le code ami fait 6 caractères'); const r = await run(api.friendRequest(c)); if (r) { toast(r === 'accepted' ? 'Vous êtes maintenant amis !' : r === 'déjà amis' ? 'Vous êtes déjà amis' : 'Demande envoyée'); setCode(''); load(); refreshSocial() } };
  const respond = async (f: Friend, ok: boolean) => { await run(api.friendRespond(f.id, ok)); toast(ok ? `${f.pseudo} est ton ami !` : 'Demande refusée'); load(); refreshSocial() };
  const invite = async () => {
    const url = location.origin + location.pathname; const text = `Rejoins-moi sur Bestiaire, le safari photo de la faune de France ! Mon code ami : ${data?.code}`;
    if (navigator.share) { try { await navigator.share({ title: 'Bestiaire', text, url }); return } catch { return } }
    try { await navigator.clipboard.writeText(`${text} ${url}`); toast('Invitation copiée : colle-la dans un message') } catch { toast(`Ton code : ${data?.code}`) }
  };
  if (!data) return <p className="note">Chargement…</p>;
  const incoming = data.list.filter(f => f.incoming), outgoing = data.list.filter(f => f.status === 'pending' && !f.incoming), friends = data.list.filter(f => f.status === 'accepted');
  return (
    <div className="social">
      <div className="panel mycode">
        <p className="eyebrow">Ton code ami</p>
        <div className="row spread"><b className="code" aria-label="Ton code ami">{data.code || '······'}</b><button className="btn primary small" onClick={invite}>Inviter</button></div>
        <p className="note">Donne ce code à tes amis, ou entre le leur ci-dessous.</p>
        <div className="row addfriend"><input value={code} maxLength={6} onChange={e => setCode(e.target.value.toUpperCase())} placeholder="Code ami" aria-label="Code ami à ajouter" autoCapitalize="characters" /><button className="btn" onClick={add}>Ajouter</button></div>
      </div>
      {incoming.length > 0 && <div className="panel"><p className="eyebrow">Demandes reçues</p>{incoming.map(f => <div key={f.id} className="row spread line"><span><b>{f.pseudo}</b><br /><span className="note">{plural(f.species, 'espèce')} · {f.rating} pts</span></span><span className="row"><button className="btn primary small" onClick={() => respond(f, true)}>Accepter</button><button className="btn ghost small" onClick={() => respond(f, false)}>Refuser</button></span></div>)}</div>}
      <div className="panel"><p className="eyebrow">Mes amis · {friends.length}</p>
        {friends.length ? friends.map(f => <button key={f.id} className="friend" onClick={() => setOpen(f)}>
          <span className={`dot ${ago(f.last_seen) === 'en ligne' ? 'on' : ''}`} /><span className="fb"><b>{f.pseudo}{f.guild && <small className="gtag">[{f.guild}]</small>}</b><small>{plural(f.species, 'espèce')} · {f.rating} pts · {ago(f.last_seen)}</small></span><span className="chev">›</span></button>)
          : <p className="note">Pas encore d'amis. Partage ton code !</p>}
        {outgoing.length > 0 && <p className="note">En attente : {outgoing.map(f => f.pseudo).join(', ')}</p>}
      </div>
      {open && <PlayerSheet id={open.id} name={open.pseudo} onClose={() => setOpen(null)} extra={<button className="btn ghost" onClick={async () => { await run(api.friendRemove(open.id)); toast('Ami retiré'); setOpen(null); load() }}>Retirer</button>} />}
    </div>
  );
}

// =====================================================================
// Guilde
// =====================================================================
export function GuildView() {
  const { run, toast, refresh, refreshSocial, uid, bySpecies, state } = useGame();
  const [g, setG] = useState<Guild | null | undefined>(undefined);
  const load = useCallback(() => api.guildGet().then(setG).catch(() => setG(null)), []);
  useEffect(() => { load() }, [load]);
  if (g === undefined) return <p className="note">Chargement…</p>;
  if (!g) return <GuildFinder onJoined={() => { load(); refreshSocial() }} />;
  return <MyGuild g={g} reload={load} uid={uid} run={run} toast={toast} refresh={refresh} refreshSocial={refreshSocial} hasCards={Object.keys(bySpecies).length > 0} pseudo={state?.pseudo || null} />;
}

function Emblem({ s, size = 56 }: { s?: Species; size?: number }) {
  return <span className={`emblem ${s ? 't' + s.tier : ''}`} style={{ width: size, height: size }}>{s ? <span className="spr" style={photoStyle(s) || undefined} /> : <span className="ph">⚑</span>}</span>;
}

function GuildFinder({ onJoined }: { onJoined: () => void }) {
  const { run, toast, refresh, bySpecies, state } = useGame();
  const [q, setQ] = useState(''); const [list, setList] = useState<GuildSummary[] | null>(null); const [create, setCreate] = useState(false);
  const [repG, setRepG] = useState<GuildSummary | null>(null);
  useEffect(() => { const t = setTimeout(() => api.guildList(q).then(setList).catch(() => setList([])), 250); return () => clearTimeout(t) }, [q]);
  const join = async (x: GuildSummary) => { const r = await run(api.guildJoin(x.id).then(() => true)); if (r) { toast(`Bienvenue chez ${x.name} !`); onJoined() } };
  return (
    <div className="social">
      <div className="panel"><p className="eyebrow">Guildes</p><h2>Rejoins une guilde</h2>
        <p className="note">Jusqu'à 30 naturalistes. Chaque semaine, la guilde a un objectif de photos commun : s'il est atteint, chaque membre gagne <b>60 plumes et 1 pellicule</b>. Discute avec ta guilde et défie ses membres.</p>
        <button className="btn primary" onClick={() => setCreate(true)}>Fonder une guilde · 100 plumes</button></div>
      <label className="search"><input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Chercher une guilde (nom ou sigle)" aria-label="Chercher une guilde" /></label>
      {!list ? <p className="note">Chargement…</p> : list.length ? list.map(x => <div key={x.id} className="guildrow">
        <Emblem s={x.emblem ? BYID[x.emblem] : undefined} size={48} />
        <span className="gb"><b>{x.name} <small className="gtag">[{x.tag}]</small></b><small>{x.descr || '—'}</small><small>{plural(x.n, 'membre')}/30{x.rating ? ` · ${x.rating} pts en moyenne` : ''}</small></span>
        <span className="gact2"><button className="btn small" disabled={!x.open || x.n >= 30} onClick={() => join(x)}>{!x.open ? 'Fermée' : x.n >= 30 ? 'Complète' : 'Rejoindre'}</button><button className="linklike" onClick={() => setRepG(x)}>Signaler</button></span></div>)
        : <div className="panel"><p className="note">Aucune guilde{q ? ' trouvée' : " pour l'instant : fonde la première !"}</p></div>}
      {repG && <ReportSheet kind="guilde" refId={String(repG.id)} label={`${repG.name} [${repG.tag}] ${repG.descr}`} onClose={() => setRepG(null)} />}
      {create && <CreateGuild onClose={() => setCreate(false)} onDone={() => { setCreate(false); refresh(); onJoined() }} cards={Object.keys(bySpecies)} plumes={state?.plumes || 0} run={run} toast={toast} />}
    </div>
  );
}

function CreateGuild({ onClose, onDone, cards, plumes, run, toast }: { onClose: () => void; onDone: () => void; cards: string[]; plumes: number; run: ReturnType<typeof useGame>['run']; toast: (m: string) => void }) {
  const [name, setName] = useState(''); const [tag, setTag] = useState(''); const [descr, setDescr] = useState(''); const [emblem, setEmblem] = useState<string | null>(null);
  const opts = cards.map(id => BYID[id]).filter(Boolean).sort((a, b) => b.tier - a.tier).slice(0, 24);
  const go = async () => {
    if (name.trim().length < 3) return toast('Nom : 3 caractères minimum'); if (!/^[A-Za-z0-9]{2,4}$/.test(tag)) return toast('Sigle : 2 à 4 lettres ou chiffres');
    const r = await run(api.guildCreate(name.trim(), tag.toUpperCase(), descr.trim(), emblem)); if (r) { toast('Guilde fondée !'); onDone() }
  };
  return (
    <Sheet onClose={onClose} label="Fonder une guilde">
      <h2>Fonder une guilde</h2>
      <label className="field">Nom<input value={name} maxLength={24} onChange={e => setName(e.target.value)} placeholder="Les Hiboux de Nancy" /></label>
      <label className="field">Sigle (2 à 4 caractères)<input value={tag} maxLength={4} onChange={e => setTag(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))} placeholder="HIB" /></label>
      <label className="field">Description<input value={descr} maxLength={140} onChange={e => setDescr(e.target.value)} placeholder="Photographes de nuit, entraide et bonne humeur" /></label>
      <p className="eyebrow">Emblème (un animal de ta collection)</p>
      <div className="emblems">{opts.length ? opts.map(s => <button key={s.id} aria-pressed={emblem === s.id} onClick={() => setEmblem(emblem === s.id ? null : s.id)} title={s.nom}><Emblem s={s} size={52} /></button>) : <p className="note">Photographie des animaux pour choisir un emblème.</p>}</div>
      <button className="btn primary big" disabled={plumes < 100} onClick={go}>{plumes < 100 ? `Il te faut 100 plumes (tu en as ${plumes})` : 'Fonder · 100 plumes'}</button>
      <button className="btn" onClick={onClose}>Annuler</button>
    </Sheet>
  );
}

function MyGuild({ g, reload, uid, run, toast, refresh, refreshSocial, pseudo }: { g: Guild; reload: () => void; uid: string; run: ReturnType<typeof useGame>['run']; toast: (m: string) => void; refresh: () => Promise<void>; refreshSocial: () => Promise<void>; hasCards: boolean; pseudo: string | null }) {
  const [pick, setPick] = useState<Guild['messages'][number] | null>(null); const [repM, setRepM] = useState<Guild['messages'][number] | null>(null);
  const [msg, setMsg] = useState(''); const [member, setMember] = useState<Guild['members'][number] | null>(null); const [settings, setSettings] = useState(false); const [leave, setLeave] = useState(false);
  const chat = useRef<HTMLDivElement>(null); const host = useRef<HTMLDivElement>(null);
  // messages : temps réel si disponible, sinon rafraîchissement toutes les 10 s
  useEffect(() => {
    const t = setInterval(reload, 10_000);
    const ch = supabase.channel('guild-' + g.id).on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'guild_messages', filter: `guild_id=eq.${g.id}` }, () => reload()).subscribe();
    return () => { clearInterval(t); supabase.removeChannel(ch) };
  }, [g.id, reload]);
  useEffect(() => { if (chat.current) chat.current.scrollTop = chat.current.scrollHeight }, [g.messages.length]);
  const send = async () => { const b = msg.trim(); if (!b) return; setMsg(''); const r = await run(api.guildPost(b).then(() => true)); if (!r) setMsg(b); reload() };
  const claim = async () => { const r = await run(api.guildClaim()); if (r) { buzz([20, 30, 50]); confetti(host.current, ['#f0b54a', '#8fbf7f', '#fff'], 70, 0); toast('+60 plumes et 1 pellicule !'); reload(); refresh(); refreshSocial() } };
  const act = async (a: 'exclure' | 'promouvoir' | 'retrograder' | 'chef') => { if (!member) return; await run(api.guildManage(member.id, a)); toast('C’est fait'); setMember(null); reload() };
  const pct = Math.min(100, (100 * g.week.photos) / g.week.goal); const reached = g.week.photos >= g.week.goal;
  const s = g.emblem ? BYID[g.emblem] : undefined; const boss = g.role === 'chef' || g.role === 'officier';
  return (
    <div className="social" ref={host} style={{ position: 'relative' }}>
      <div className="panel ghead"><Emblem s={s} size={68} /><div><h2>{g.name} <small className="gtag">[{g.tag}]</small></h2><p className="note">{g.descr || 'Pas encore de description.'}</p><p className="note">{plural(g.members.length, 'membre')}/30 · tu es <b>{g.role}</b>{!g.open ? ' · guilde fermée' : ''}</p></div></div>
      <div className="panel"><div className="row spread"><p className="eyebrow">Objectif de la semaine</p><span className="note">{g.week.photos} / {g.week.goal} photos</span></div>
        <div className="bar big"><i style={{ width: `${pct}%` }} /></div>
        <p className="note">Toutes les photos prises en safari par les membres depuis lundi comptent. Récompense : 60 plumes et 1 pellicule pour chacun.</p>
        {g.claimed ? <p className="note"><b>✓ Récompense récupérée cette semaine.</b></p> : <button className="btn primary" disabled={!reached} onClick={claim}>{reached ? 'Récupérer la récompense' : `Encore ${g.week.goal - g.week.photos} photos`}</button>}</div>
      <div className="panel"><p className="eyebrow">Discussion</p>
        <div className="chat" ref={chat} aria-live="polite">{g.messages.length ? g.messages.map(m => m.user_id && m.user_id !== uid
          ? <button key={m.id} className="msg" onClick={() => setPick(m)} aria-label={`Message de ${m.pseudo} : ${m.body}. Toucher pour signaler`}><b>{m.pseudo} </b><span>{m.body}</span></button>
          : <p key={m.id} className={m.user_id === null ? 'sys' : 'me'}><span>{m.body}</span></p>) : <p className="sys">Dis bonjour à ta guilde !</p>}</div>
        {!pseudo && <p className="note">Astuce : choisis un pseudo dans ton profil pour que la guilde te reconnaisse.</p>}
        <div className="row addfriend"><input value={msg} maxLength={200} onChange={e => setMsg(e.target.value)} onKeyDown={e => e.key === 'Enter' && send()} placeholder="Écrire à la guilde…" aria-label="Message à la guilde" /><button className="btn" onClick={send}>Envoyer</button></div></div>
      <div className="panel"><p className="eyebrow">Membres</p>
        {g.members.map(m => <button key={m.id} className="friend" onClick={() => m.id !== uid && setMember(m)} disabled={m.id === uid}>
          <span className={`dot ${ago(m.last_seen) === 'en ligne' ? 'on' : ''}`} /><span className="fb"><b>{m.pseudo}{m.id === uid ? ' (toi)' : ''} {m.role !== 'membre' && <small className={`role ${m.role}`}>{m.role}</small>}</b><small>{plural(m.week, 'photo')} cette semaine · {plural(m.species, 'espèce')} · {m.rating} pts</small></span>{m.id !== uid && <span className="chev">›</span>}</button>)}</div>
      <div className="row">{boss && <button className="btn ghost" onClick={() => setSettings(true)}>Réglages de la guilde</button>}<button className="btn ghost" onClick={() => setLeave(true)}>Quitter la guilde</button></div>
      {member && <PlayerSheet id={member.id} name={member.pseudo} onClose={() => setMember(null)} extra={<>
        {g.role === 'chef' && (member.role === 'membre' ? <button className="btn ghost" onClick={() => act('promouvoir')}>Nommer officier</button> : <button className="btn ghost" onClick={() => act('retrograder')}>Retirer officier</button>)}
        {g.role === 'chef' && <button className="btn ghost" onClick={() => act('chef')}>Céder la tête</button>}
        {(g.role === 'chef' || (g.role === 'officier' && member.role === 'membre')) && <button className="btn ghost danger" onClick={() => act('exclure')}>Exclure</button>}</>} />}
      {pick && <Sheet onClose={() => setPick(null)} label="Message"><blockquote className="quote"><b>{pick.pseudo}</b> : {pick.body}</blockquote>
        <button className="btn ghost" onClick={() => { setRepM(pick); setPick(null) }}>Signaler ce message</button>
        <button className="btn ghost" onClick={async () => { const who = pick; setPick(null); const r = await run(api.block(who.user_id!, true).then(() => true)); if (r) { toast(`${who.pseudo} est bloqué`); reload() } }}>Bloquer {pick.pseudo}</button>
        <button className="btn" onClick={() => setPick(null)}>Annuler</button></Sheet>}
      {repM && <ReportSheet kind="message" refId={String(repM.id)} label={`${repM.pseudo} : ${repM.body}`} onClose={() => setRepM(null)} onDone={reload} />}
      {settings && <GuildSettings g={g} onClose={() => setSettings(false)} onSaved={() => { setSettings(false); reload() }} run={run} toast={toast} />}
      {leave && <Sheet onClose={() => setLeave(false)} label="Quitter la guilde"><h2>Quitter {g.name} ?</h2>
        <p className="note">{g.role === 'chef' ? (g.members.length > 1 ? 'Un officier (ou le plus ancien membre) deviendra chef.' : 'Tu es seul : la guilde sera dissoute.') : 'Tu pourras en rejoindre une autre ; la récompense hebdomadaire sera disponible la semaine suivante.'}</p>
        <button className="btn primary" onClick={async () => { await run(api.guildLeave()); setLeave(false); toast('Tu as quitté la guilde'); reload(); refreshSocial() }}>Quitter</button><button className="btn" onClick={() => setLeave(false)}>Annuler</button></Sheet>}
    </div>
  );
}

function GuildSettings({ g, onClose, onSaved, run, toast }: { g: Guild; onClose: () => void; onSaved: () => void; run: ReturnType<typeof useGame>['run']; toast: (m: string) => void }) {
  const [descr, setDescr] = useState(g.descr); const [open, setOpen] = useState(g.open);
  return <Sheet onClose={onClose} label="Réglages de la guilde"><h2>Réglages</h2>
    <label className="field">Description<input value={descr} maxLength={140} onChange={e => setDescr(e.target.value)} /></label>
    <label className="check"><input type="checkbox" checked={open} onChange={e => setOpen(e.target.checked)} /> Guilde ouverte (tout le monde peut la rejoindre)</label>
    <button className="btn primary" onClick={async () => { await run(api.guildUpdate(descr, open)); toast('Réglages enregistrés'); onSaved() }}>Enregistrer</button><button className="btn" onClick={onClose}>Annuler</button></Sheet>;
}

