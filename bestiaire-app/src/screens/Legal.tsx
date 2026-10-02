import { ReactNode, useState } from 'react';
import { Sheet } from '../components/ui';

// ---------------------------------------------------------------------
// À COMPLÉTER AVANT L'OUVERTURE AU PUBLIC : les champs ci-dessous.
// (Rien n'est inventé : ce que le jeu ne peut pas savoir est marqué « à compléter ».)
// ---------------------------------------------------------------------
export const LEGAL = {
  editeur: 'Victor Courtehoute',
  statut: '[statut à compléter : particulier, micro-entreprise (n° SIRET)…]',
  adresse: '[adresse postale à compléter]',
  contact: '[adresse e-mail de contact à compléter]',
  regionDonnees: '[région du projet Supabase à compléter, par ex. « Europe de l’Ouest (Paris) »]',
  maj: '2 octobre 2026',
};
const Todo = ({ children }: { children: ReactNode }) => (String(children).startsWith('[') ? <mark className="todo">{children}</mark> : <>{children}</>);

type Doc = 'mentions' | 'confidentialite' | 'cgu' | 'cgv';
const TITLES: Record<Doc, string> = { mentions: 'Mentions légales', confidentialite: 'Confidentialité', cgu: "Conditions d'utilisation", cgv: 'Conditions de vente' };

export function LegalSheet({ start = 'mentions', onClose }: { start?: Doc; onClose: () => void }) {
  const [d, setD] = useState<Doc>(start);
  return (
    <Sheet onClose={onClose} label={TITLES[d]}>
      <div className="filters small" role="tablist">{(Object.keys(TITLES) as Doc[]).map(k => <button key={k} role="tab" aria-pressed={d === k} onClick={() => setD(k)}>{TITLES[k]}</button>)}</div>
      <article className="legal">
        <h2>{TITLES[d]}</h2>
        {d === 'mentions' && <Mentions />}{d === 'confidentialite' && <Privacy />}{d === 'cgu' && <Cgu />}{d === 'cgv' && <Cgv />}
        <p className="note">Dernière mise à jour : {LEGAL.maj}</p>
      </article>
      <button className="btn" onClick={onClose}>Fermer</button>
    </Sheet>
  );
}

function Mentions() {
  return <>
    <h3>Éditeur</h3>
    <p>Bestiaire est édité par <b>{LEGAL.editeur}</b>, <Todo>{LEGAL.statut}</Todo>.<br />Adresse : <Todo>{LEGAL.adresse}</Todo><br />Contact : <Todo>{LEGAL.contact}</Todo><br />Directeur de la publication : {LEGAL.editeur}.</p>
    <h3>Hébergement</h3>
    <p><b>Site</b> : GitHub Pages, service de GitHub, Inc., 88 Colin P. Kelly Jr. Street, San Francisco, CA 94107, États-Unis (github.com).</p>
    <p><b>Base de données et comptes</b> : Supabase, Inc. (supabase.com), région : <Todo>{LEGAL.regionDonnees}</Todo>.</p>
    <p><b>Paiements</b> : Stripe Payments Europe, Ltd., Dublin, Irlande (stripe.com).</p>
    <h3>Contenus</h3>
    <p>Données sur les espèces : GBIF et Wikidata. Photographies : contributeurs d'iNaturalist, sous licences Creative Commons ; l'auteur et la licence de chaque photo sont indiqués sur sa fiche, avec un lien vers l'original.</p>
    <p>Le jeu, son code et ses textes sont la propriété de l'éditeur, sauf les contenus tiers ci-dessus qui restent soumis à leurs licences.</p>
  </>;
}

function Privacy() {
  return <>
    <p>Cette page explique quelles données Bestiaire utilise, pourquoi, et quels sont tes droits (Règlement général sur la protection des données, RGPD).</p>
    <h3>Responsable du traitement</h3>
    <p>{LEGAL.editeur} — contact : <Todo>{LEGAL.contact}</Todo>.</p>
    <h3>Données collectées</h3>
    <ul>
      <li><b>Compte</b> : adresse e-mail (et mot de passe chiffré, ou identifiant Google si tu utilises ce mode de connexion).</li>
      <li><b>Jeu</b> : pseudo, fuseau horaire (pour le jour et la nuit), cartes, plumes, pellicules, défis, succès, combats, enchères, amis, guilde, messages de guilde, date de dernière connexion.</li>
      <li><b>Abonnement</b> : identifiant client Stripe et date de fin d'abonnement. Tes coordonnées bancaires sont saisies chez Stripe : Bestiaire ne les voit jamais.</li>
    </ul>
    <p>Bestiaire n'utilise <b>ni publicité, ni pistage, ni cookie publicitaire ou de mesure d'audience</b>. Le navigateur garde seulement ta session de connexion et tes préférences d'affichage : c'est nécessaire au fonctionnement, sans consentement à recueillir.</p>
    <h3>Pourquoi</h3>
    <p>Pour faire fonctionner le jeu et ton compte (exécution du contrat que tu acceptes en t'inscrivant), et pour gérer l'abonnement si tu le prends (obligations comptables).</p>
    <h3>Qui voit quoi</h3>
    <p>Les autres joueurs voient ton pseudo, ton classement, ta défense, tes enchères et, s'ils sont tes amis ou dans ta guilde, tes plus belles cartes et tes statistiques. Ton adresse e-mail n'est jamais montrée. Les prestataires techniques (Supabase, GitHub, Stripe) traitent les données pour notre compte ; certains sont situés aux États-Unis et encadrés par les clauses contractuelles types de la Commission européenne.</p>
    <h3>Durée de conservation</h3>
    <p>Tant que ton compte existe. Si tu le supprimes, toutes tes données de jeu sont effacées immédiatement ; les factures de l'abonnement sont conservées par Stripe pendant la durée légale.</p>
    <h3>Tes droits</h3>
    <p>Tu peux accéder à tes données, les corriger, les exporter, t'opposer à leur traitement ou les faire effacer. La suppression se fait directement dans <b>Profil &gt; Supprimer mon compte</b> ; pour le reste, écris à <Todo>{LEGAL.contact}</Todo>. Tu peux aussi saisir la CNIL (cnil.fr).</p>
    <h3>Âge</h3>
    <p>Bestiaire s'adresse aux personnes de 15 ans et plus. En dessous, l'accord d'un parent est nécessaire.</p>
  </>;
}

function Cgu() {
  return <>
    <h3>Le service</h3>
    <p>Bestiaire est un jeu gratuit de collection de photos d'animaux, accessible depuis un navigateur. En créant un compte, tu acceptes ces conditions.</p>
    <h3>Ton compte</h3>
    <p>Un compte par personne. Tu es responsable de ce qui se passe avec ton compte. Tu peux le supprimer à tout moment depuis ton profil.</p>
    <h3>Monnaie et objets du jeu</h3>
    <p>Les plumes, pellicules et cartes n'ont <b>aucune valeur monétaire</b> : elles ne s'achètent pas avec de l'argent réel, ne se convertissent pas en argent et ne s'échangent qu'à l'intérieur du jeu. Les chances d'obtenir chaque rareté sont affichées dans le profil et sont les mêmes pour tous les joueurs, abonnés ou non.</p>
    <h3>Comportement</h3>
    <p>Pseudos, noms de guilde et messages doivent rester respectueux : pas d'insultes, de harcèlement, de contenu illicite, haineux ou à caractère sexuel, pas de données personnelles d'autrui. La triche, l'exploitation de bugs et l'usage de programmes automatisés sont interdits. En cas d'abus, l'éditeur peut modifier un pseudo, supprimer des messages, retirer des gains obtenus illégitimement ou suspendre un compte.</p>
    <h3>Disponibilité</h3>
    <p>Le jeu est fourni tel quel et peut évoluer (équilibrage, nouvelles fonctions). L'éditeur fait de son mieux pour qu'il soit disponible, sans pouvoir le garantir en permanence.</p>
    <h3>Contact et droit applicable</h3>
    <p>Pour toute question : <Todo>{LEGAL.contact}</Todo>. Ces conditions sont soumises au droit français.</p>
  </>;
}

function Cgv() {
  return <>
    <h3>Bestiaire+</h3>
    <p>Abonnement mensuel de <b>4,99 € TTC par mois</b>, sans engagement. Il donne : une pellicule toutes les 40 minutes au lieu d'une heure, une réserve de 9 pellicules au lieu de 6, et un 4ᵉ défi quotidien. Il ne change pas les chances d'obtenir chaque rareté.</p>
    <h3>Paiement et renouvellement</h3>
    <p>Le paiement se fait par carte via Stripe, au moment de la souscription puis chaque mois à la même date, jusqu'à résiliation.</p>
    <h3>Résiliation</h3>
    <p>À tout moment, en deux clics : <b>Profil &gt; Gérer mon abonnement</b>. Les avantages restent actifs jusqu'à la fin du mois déjà payé ; aucun remboursement au prorata.</p>
    <h3>Droit de rétractation</h3>
    <p>Les avantages sont un contenu numérique fourni immédiatement. En souscrivant, tu demandes cette exécution immédiate et tu reconnais perdre ton droit de rétractation de 14 jours (article L221-28 du Code de la consommation) ; c'est la case à cocher demandée avant le paiement.</p>
    <h3>Réclamations et médiation</h3>
    <p>Écris d'abord à <Todo>{LEGAL.contact}</Todo>. En cas de litige non résolu, tu peux recourir gratuitement à un médiateur de la consommation : <Todo>[nom et site du médiateur à compléter]</Todo>.</p>
  </>;
}
