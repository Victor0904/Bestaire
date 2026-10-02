import { useEffect, useState } from 'react';
import { api, AdminReport, ReportReason } from '../lib/api';
import { useGame } from '../lib/store';
import { Sheet } from './ui';

const REASONS: [ReportReason, string][] = [['insulte', 'Insulte, grossièreté'], ['harcelement', 'Harcèlement'], ['haine', 'Propos haineux ou discriminatoires'], ['sexuel', 'Contenu sexuel'], ['spam', 'Spam, publicité'], ['autre', 'Autre']];
const KIND_N = { message: 'ce message', pseudo: 'ce pseudo', guilde: 'cette guilde' };

/** Signaler un message, un pseudo ou une guilde */
export function ReportSheet({ kind, refId, label, onClose, onDone }: { kind: 'message' | 'pseudo' | 'guilde'; refId: string; label: string; onClose: () => void; onDone?: () => void }) {
  const { run, toast } = useGame();
  const [reason, setReason] = useState<ReportReason | null>(null);
  const send = async () => { if (!reason) return; const r = await run(api.report(kind, refId, reason)); if (r) { toast(r === 'masqué' ? 'Merci : ce message est maintenant masqué' : 'Merci, le signalement a été transmis'); onDone?.(); onClose() } };
  return (
    <Sheet onClose={onClose} label="Signaler">
      <h2>Signaler {KIND_N[kind]}</h2>
      <blockquote className="quote">{label}</blockquote>
      <div className="reasons" role="radiogroup" aria-label="Motif">{REASONS.map(([k, t]) => <label key={k} className="check"><input type="radio" name="motif" checked={reason === k} onChange={() => setReason(k)} /> {t}</label>)}</div>
      <p className="note">Le signalement est anonyme. Un message signalé par trois joueurs est masqué automatiquement en attendant la modération.</p>
      <button className="btn primary" disabled={!reason} onClick={send}>Envoyer le signalement</button><button className="btn" onClick={onClose}>Annuler</button>
    </Sheet>
  );
}

/** Joueurs bloqués (dans le profil) */
export function BlockedList() {
  const { run, toast } = useGame();
  const [list, setList] = useState<{ id: string; pseudo: string }[] | null>(null);
  const load = () => api.myBlocks().then(setList).catch(() => setList([]));
  useEffect(() => { load() }, []);
  if (!list?.length) return null;
  return <div className="panel"><p className="eyebrow">Joueurs bloqués</p>
    {list.map(b => <div key={b.id} className="row spread line"><span>{b.pseudo}</span><button className="btn ghost small" onClick={async () => { await run(api.block(b.id, false)); toast('Joueur débloqué'); load() }}>Débloquer</button></div>)}
    <p className="note">Tu ne vois plus leurs messages et ils ne peuvent plus t'ajouter en ami.</p></div>;
}

/** Outils de l'administrateur : signalements à traiter */
export function AdminPanel() {
  const { run, toast } = useGame();
  const [list, setList] = useState<AdminReport[] | null>(null);
  const load = () => api.adminReports().then(setList).catch(() => setList([]));
  useEffect(() => { load() }, []);
  const act = async (r: AdminReport, a: Parameters<typeof api.adminAct>[2]) => { await run(api.adminAct(r.kind, r.ref, a)); toast('Signalement traité'); load() };
  return (
    <div className="panel admin"><p className="eyebrow">Modération · administrateur</p>
      {!list ? <p className="note">Chargement…</p> : !list.length ? <p className="note">Aucun signalement en attente.</p> : list.map(r => <div key={r.kind + r.ref} className="report">
        <div className="row spread"><b>{r.kind === 'message' ? 'Message' : r.kind === 'pseudo' ? 'Pseudo' : 'Guilde'} · {r.target || 'joueur sans pseudo'}</b><span className="rbadge t3">{r.n} signalement{r.n > 1 ? 's' : ''}</span></div>
        <blockquote className="quote">{r.excerpt}</blockquote>
        <p className="note">Motifs : {r.reasons.join(', ')}{r.muted_until && Date.parse(r.muted_until) > Date.now() ? ' · déjà muet' : ''}</p>
        <div className="row">
          {r.kind === 'message' && <button className="btn small" onClick={() => act(r, 'masquer')}>Masquer</button>}
          {r.kind === 'guilde' && <button className="btn small" onClick={() => act(r, 'guilde')}>Renommer la guilde</button>}
          <button className="btn small" onClick={() => act(r, 'pseudo')}>Effacer le pseudo</button>
          <button className="btn small" onClick={() => act(r, 'muet')}>Muet 7 jours</button>
          <button className="btn small danger" onClick={() => act(r, 'bannir')}>Bannir</button>
          <button className="btn ghost small" onClick={() => act(r, 'ignorer')}>Ignorer</button>
        </div></div>)}
    </div>
  );
}
