import { useState } from 'react';
import { FRANCE, ODDS, TIERS } from '../game/species';
import { api } from '../lib/api';
import { supabase } from '../lib/supabase';
import { useGame } from '../lib/store';

export function Profile() {
  const { state, uid, run, toast, refresh } = useGame();
  const [pseudo, setPseudo] = useState(state?.pseudo || '');
  const per = [0, 0, 0, 0, 0]; FRANCE.forEach(s => per[s.tier]++);
  const premium = !!state?.premium;
  const subscribe = async () => { const url = await run(api.checkout()); if (url) location.href = url };
  const manage = async () => { const url = await run(api.portal()); if (url) location.href = url };
  return (
    <section className="view">
      <h2>Mon profil</h2>
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
          : <button className="btn primary big" onClick={subscribe}>S'abonner</button>}
      </div>
      <div className="panel"><p className="eyebrow">Chances par photo</p>
        <table className="odds"><tbody>{TIERS.map((t, i) => <tr key={t}><td><span className={`rbadge t${i}`}>{t}</span> <span className="note">{per[i]} espèces</span></td><td>{ODDS[i]} %</td></tr>)}</tbody></table></div>
      <div className="panel">
        <p style={{ margin: 0 }}><b>Pellicules.</b> 5 photos par pellicule. Recharge automatique (1 par heure, 40 min avec Bestiaire+).</p>
        <p style={{ margin: 0 }}><b>Heure et saison réelles.</b> Le jour les diurnes, la nuit les nocturnes ; migrateurs et insectes selon les mois réellement observés.</p>
        <p style={{ margin: 0 }}><b>Biome du jour.</b> Chances d'espèces rares doublées dans un milieu différent chaque jour.</p>
        <p style={{ margin: 0 }}><b>Plumes.</b> La monnaie du jeu, gagnée en combat, en défis et au marché.</p>
      </div>
      <div className="panel"><p className="eyebrow">Données et photos</p><p className="note">Espèces : GBIF et Wikidata. Photos : iNaturalist, sous licences Creative Commons (auteur et licence sur chaque fiche).</p></div>
      <button className="btn ghost" onClick={() => supabase.auth.signOut()}>Se déconnecter</button>
    </section>
  );
}
