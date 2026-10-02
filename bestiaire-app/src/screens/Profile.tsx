import { useState } from 'react';
import { FRANCE, ODDS, TIERS } from '../game/species';
import { api } from '../lib/api';
import { supabase } from '../lib/supabase';
import { useGame } from '../lib/store';
import { Sheet } from '../components/ui';
import { InstallHelp } from '../components/Install';
import { Onboarding } from '../components/Onboarding';
import { Achievements, Friends, GuildView } from './Social';
import { LegalSheet } from './Legal';
import { NotifSettings } from '../components/Notifications';
import { AdminPanel, BlockedList } from '../components/Moderation';
import { getTheme, setTheme, Theme } from '../lib/theme';

export function Profile() {
  const { sub, setSub, badges } = useGame();
  const tabs: [string, string, number | boolean][] = [['profil', 'Profil', 0], ['succes', 'Succès', badges.ach], ['amis', 'Amis', badges.friends], ['guilde', 'Guilde', badges.guild]];
  return (
    <section className="view">
      <div className="seg subtabs" role="tablist" aria-label="Sections du profil">
        {tabs.map(([k, n, b]) => <button key={k} role="tab" aria-selected={sub === k} onClick={() => setSub(k)}>{n}{b ? <i className="bdot" aria-label="nouveau" /> : null}</button>)}
      </div>
      {sub === 'profil' && <Me />}{sub === 'succes' && <Achievements />}{sub === 'amis' && <Friends />}{sub === 'guilde' && <GuildView />}
    </section>
  );
}

function Me() {
  const { state, uid, run, toast, refresh } = useGame();
  const [pseudo, setPseudo] = useState(state?.pseudo || '');
  const [legal, setLegal] = useState<null | 'mentions' | 'confidentialite' | 'cgu' | 'cgv'>(null);
  const [tuto, setTuto] = useState(false); const [del, setDel] = useState(false); const [confirm, setConfirm] = useState('');
  const [waive, setWaive] = useState(false);
  const [theme, setTh] = useState<Theme>(getTheme());
  const per = [0, 0, 0, 0, 0]; FRANCE.forEach(s => per[s.tier]++);
  const premium = !!state?.premium;
  const subscribe = async () => { if (!waive) return toast('Coche la case pour accéder tout de suite aux avantages'); const url = await run(api.checkout()); if (url) location.href = url };
  const manage = async () => { const url = await run(api.portal()); if (url) location.href = url };
  const destroy = async () => { const r = await run(api.deleteAccount().then(() => true)); if (r) { await supabase.auth.signOut(); location.reload() } };
  return (
    <>
      <div className="panel">
        <label className="field">Pseudo (visible par les autres joueurs)<input value={pseudo} maxLength={24} onChange={e => setPseudo(e.target.value)} /></label>
        <button className="btn" onClick={async () => { if (pseudo.trim().length < 2) return toast('2 caractères minimum'); await run(api.setProfile(uid, { pseudo: pseudo.trim() })); toast('Pseudo enregistré'); refresh() }}>Enregistrer</button>
        <p className="note">{state?.wins || 0} victoire(s) contre les animaux sauvages · classement {state?.rating || 1000} points.</p>
      </div>
      <div className={`panel premium ${premium ? 'on' : ''}`}>
        <div className="row spread"><p className="eyebrow">Bestiaire+</p>{premium && <span className="rbadge t4">Actif</span>}</div>
        <h2>{premium ? 'Merci pour ton soutien !' : 'Passe à Bestiaire+ · 4,99 € / mois'}</h2>
        <ul className="perks"><li>Une pellicule toutes les <b>40 minutes</b> au lieu d'une heure</li><li>Réserve de <b>9 pellicules</b> au lieu de 6</li><li>Un <b>4ᵉ défi</b> chaque jour, qui rapporte une pellicule</li><li>Sans engagement, résiliable à tout moment</li></ul>
        {premium ? <><p className="note">Actif jusqu'au {state?.premium_until ? new Date(state.premium_until).toLocaleDateString('fr-FR') : ''} (renouvelé automatiquement).</p><button className="btn ghost" onClick={manage}>Gérer mon abonnement</button></>
          : <><label className="check"><input type="checkbox" checked={waive} onChange={e => setWaive(e.target.checked)} /> <span>Je veux profiter des avantages tout de suite et je renonce à mon droit de rétractation de 14 jours (<button type="button" className="linklike" onClick={() => setLegal('cgv')}>conditions de vente</button>).</span></label>
            <button className="btn primary big" onClick={subscribe}>S'abonner</button></>}
      </div>
      {state?.is_admin && <AdminPanel />}
      <div className="panel"><p className="eyebrow">Apparence</p>
        <div className="seg" role="radiogroup" aria-label="Thème">{(['auto', 'clair', 'sombre'] as Theme[]).map(t => <button key={t} role="radio" aria-checked={theme === t} aria-pressed={theme === t} onClick={() => { setTheme(t); setTh(t) }}>{t === 'auto' ? 'Automatique' : t === 'clair' ? 'Clair' : 'Sombre'}</button>)}</div>
        <p className="note">{theme === 'auto' ? 'Suit le réglage de ton téléphone (sombre le soir si tu l’as activé).' : 'Mémorisé sur cet appareil.'}</p></div>
      <div className="panel"><p className="eyebrow">Sur ton téléphone</p><h2>Installer l'appli</h2><InstallHelp /></div>
      <NotifSettings />
      <BlockedList />
      <div className="panel"><p className="eyebrow">Chances par photo</p>
        <table className="odds"><tbody>{TIERS.map((t, i) => <tr key={t}><td><span className={`rbadge t${i}`}>{t}</span> <span className="note">{per[i]} espèces</span></td><td>{ODDS[i]} %</td></tr>)}</tbody></table>
        <p className="note">Les mêmes pour tout le monde, abonné ou non.</p></div>
      <div className="panel">
        <p style={{ margin: 0 }}><b>Pellicules.</b> 5 photos par pellicule. Recharge automatique (1 par heure, 40 min avec Bestiaire+).</p>
        <p style={{ margin: 0 }}><b>Heure et saison réelles.</b> Le jour les diurnes, la nuit les nocturnes ; migrateurs et insectes selon les mois réellement observés.</p>
        <p style={{ margin: 0 }}><b>Biome du jour.</b> Chances d'espèces rares doublées dans un milieu différent chaque jour.</p>
        <p style={{ margin: 0 }}><b>Plumes.</b> La monnaie du jeu, gagnée en combat, en défis, en succès et au marché.</p>
        <button className="btn ghost small" onClick={() => setTuto(true)}>Revoir le tutoriel</button>
      </div>
      <div className="panel"><p className="eyebrow">Données et photos</p><p className="note">Espèces : GBIF et Wikidata. Photos : iNaturalist, sous licences Creative Commons (auteur et licence sur chaque fiche).</p></div>
      <nav className="legallinks" aria-label="Informations légales">
        <button className="linklike" onClick={() => setLegal('mentions')}>Mentions légales</button><button className="linklike" onClick={() => setLegal('confidentialite')}>Confidentialité</button>
        <button className="linklike" onClick={() => setLegal('cgu')}>Conditions d'utilisation</button><button className="linklike" onClick={() => setLegal('cgv')}>Conditions de vente</button>
      </nav>
      <div className="row"><button className="btn ghost" onClick={() => supabase.auth.signOut()}>Se déconnecter</button><button className="btn ghost danger" onClick={() => setDel(true)}>Supprimer mon compte</button></div>
      {legal && <LegalSheet start={legal} onClose={() => setLegal(null)} />}
      {tuto && <Onboarding onDone={() => setTuto(false)} />}
      {del && <Sheet onClose={() => setDel(false)} label="Supprimer mon compte"><h2>Supprimer mon compte ?</h2>
        <p className="note">Ton compte, tes cartes, tes plumes, tes amis et ta place dans ta guilde seront <b>effacés définitivement</b>. Tes enchères en cours seront annulées. {premium ? 'Résilie d’abord ton abonnement Bestiaire+.' : ''}</p>
        <label className="field">Écris SUPPRIMER pour confirmer<input value={confirm} onChange={e => setConfirm(e.target.value)} autoCapitalize="characters" /></label>
        <button className="btn primary danger" disabled={confirm.trim().toUpperCase() !== 'SUPPRIMER'} onClick={destroy}>Supprimer définitivement</button><button className="btn" onClick={() => setDel(false)}>Annuler</button></Sheet>}
    </>
  );
}
