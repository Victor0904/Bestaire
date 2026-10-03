import { useState } from 'react';
import { InstallHelp } from './Install';

const SLIDES = [
  { k: 'hello', t: 'Bienvenue dans Bestiaire', ic: '❦', body: <>
    <p>Pars en <b>safari photo</b> à travers la faune de France : plus de 1 000 espèces réelles, avec de vraies photos de naturalistes.</p>
    <p>Le jeu suit <b>l'heure et la saison réelles</b> de ton téléphone : la nuit, les chouettes et les papillons de nuit sortent ; en hiver, certains migrateurs sont partis.</p></> },
  { k: 'safari', t: 'Le safari', ic: '◉', body: <>
    <p>Une <b>pellicule = 5 photos</b>. Choisis un milieu (forêt, prairie, zone humide, montagne, ville, littoral) puis développe tes photos une à une.</p>
    <p>Les pellicules se rechargent toutes seules (1 par heure, 6 au maximum). Le <b>biome du jour</b> double les chances d'espèces rares.</p>
    <p className="tiers"><span className="rbadge t0">commun</span><span className="rbadge t1">peu commun</span><span className="rbadge t2">rare</span><span className="rbadge t3">épique</span><span className="rbadge t4">légendaire</span></p></> },
  { k: 'fusion', t: 'Collection et fusion', ic: '⇪', body: <>
    <p>Chaque photo a une <b>qualité</b> : floue, nette, superbe ou parfaite.</p>
    <p>Deux exemplaires du même rang se <b>fusionnent</b> en un rang supérieur (jusqu'à 7 étoiles). La meilleure photo est gardée, et le niveau maximum de l'animal monte.</p>
    <p>Dans le <b>Bestiaire</b>, les filtres t'indiquent quelles espèces chercher en ce moment.</p></> },
  { k: 'combat', t: 'Aventure, combats et marché', ic: '⚔', body: <>
    <p>Forme une équipe de 3 animaux et lance-toi dans l'<b>Aventure</b> : 6 chapitres, des boss, des étoiles à gagner. Tes animaux prennent des <b>niveaux</b> et débloquent leur <b>instinct sauvage</b>, un coup ultime.</p>
    <p>La <b>chaîne alimentaire</b> compte (un prédateur fait ×1,5 contre ses proies), tout comme le milieu et l'heure.</p>
    <p>Au <b>marché</b>, vends aux enchères et achète des espèces du monde entier, qui valent plus cher.</p></> },
  { k: 'social', t: 'Amis et guildes', ic: '♥', body: <>
    <p>Ajoute tes amis avec leur <b>code ami</b>, regarde leurs plus belles cartes et défie-les en duel.</p>
    <p>Rejoins une <b>guilde</b> : objectif de photos commun chaque semaine, récompenses pour tous et discussion.</p>
    <p>Débloque des <b>succès</b> pour gagner des plumes et des pellicules.</p></> },
  { k: 'install', t: 'Mets Bestiaire sur ton écran d\'accueil', ic: '▣', body: <InstallHelp compact /> },
];

export function Onboarding({ onDone }: { onDone: () => void }) {
  const [i, setI] = useState(0); const s = SLIDES[i]; const last = i === SLIDES.length - 1;
  return (
    <div className="onb" role="dialog" aria-modal="true" aria-label="Découvrir Bestiaire">
      <div className="onb-card" key={s.k}>
        <div className="onb-ic" aria-hidden="true">{s.ic}</div>
        <h2>{s.t}</h2>
        <div className="onb-body">{s.body}</div>
      </div>
      <div className="onb-dots" aria-hidden="true">{SLIDES.map((x, j) => <i key={x.k} className={j === i ? 'on' : ''} />)}</div>
      <div className="onb-nav">
        {i > 0 ? <button className="btn ghost" onClick={() => setI(i - 1)}>Retour</button> : <button className="btn ghost" onClick={onDone}>Passer</button>}
        <button className="btn primary" onClick={() => (last ? onDone() : setI(i + 1))}>{last ? "C'est parti !" : 'Suivant'}</button>
      </div>
    </div>
  );
}
