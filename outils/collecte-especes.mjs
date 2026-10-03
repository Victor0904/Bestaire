#!/usr/bin/env node
// =====================================================================
// Bestiaire — collecte automatique des espèces d'un pays (ou du monde entier)
//
//   node outils/collecte-especes.mjs FR          → un pays (code ISO à 2 lettres)
//   node outils/collecte-especes.mjs FR BE CH    → plusieurs pays
//   node outils/collecte-especes.mjs tous        → tous les pays, dans l'ordre de priorité
//   node outils/collecte-especes.mjs etat        → où en est la collecte
//   node outils/collecte-especes.mjs recalcul    → refait les listes déjà collectées depuis le cache (aucune requête iNaturalist)
//
// Sources : iNaturalist (espèces observées, photos sous licence libre, mois, jour/nuit)
//           Wikidata (masse, notoriété, statut UICN quand disponibles).
// Règles du jeu (demandées par Victor) :
//   - mammifères, reptiles, amphibiens, poissons, requins et raies, araignées et autres arachnides :
//     TOUTES les espèces observées dans le pays qui ont une photo sous licence libre ;
//   - les autres animaux : seulement ceux qui ont un NOM FRANÇAIS et une photo.
//
// Le script est prudent avec les serveurs : 1 requête par seconde, pause en cas de saturation,
// 7 500 requêtes iNaturalist par jour au maximum, arrêt propre si le serveur nous freine. Tout est mis en cache : on peut l'arrêter
// (Ctrl+C) et le relancer, il reprend là où il s'était arrêté.
// Aucune donnée n'est envoyée nulle part : les résultats sont écrits dans le dossier « donnees ».
// =====================================================================
import { mkdirSync, existsSync, readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const DOSSIER = join(RACINE, 'donnees');
const CACHE = join(DOSSIER, 'cache');
const SORTIE = join(DOSSIER, 'pays');
for (const d of [DOSSIER, CACHE, SORTIE]) mkdirSync(d, { recursive: true });
const PLACES = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'pays-inaturalist.json'), 'utf8'));
const JOURNAL = join(DOSSIER, 'journal.txt');

const INAT = 'https://api.inaturalist.org/v1/';
const UA = { 'User-Agent': 'Bestiaire/1.0 (jeu educatif; collecte nocturne lente)', Accept: 'application/json' };
const LIMITE_JOUR = 7500, PAUSE_INAT = 1100, PAUSE_WIKIDATA = 2500, PAR_PAGE = 500, PLAFOND = 10000;
const CLASSES_COMPLETES = new Set(['M', 'R', 'A', 'P', 'K']);   // toutes les espèces, même sans nom français

// ---------------------------------------------------------------------
// Outils
// ---------------------------------------------------------------------
const dormir = ms => new Promise(r => setTimeout(r, ms));
const maintenant = () => new Date().toLocaleString('fr-FR');
const log = (...a) => { const l = `[${maintenant()}] ${a.join(' ')}`; console.log(l); appendFileSync(JOURNAL, l + '\n') };
const slug = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const lireJson = (f, d) => { try { return JSON.parse(readFileSync(f, 'utf8')) } catch { return d } };
const ecrireJson = (f, v) => writeFileSync(f, JSON.stringify(v));

// Compteur journalier de requêtes iNaturalist
const fichierCompteur = join(CACHE, 'compteur.json');
function compteur() { const c = lireJson(fichierCompteur, {}); const j = new Date().toISOString().slice(0, 10); if (c.jour !== j) return { jour: j, n: 0 }; return c }
let cpt = compteur();
class LimiteAtteinte extends Error {}
class ServeurBloque extends Error {}
// Saturations récentes : si iNaturalist refuse plus de 15 fois en 30 minutes, on s'arrête proprement
let refus = [];
const SEUIL_REFUS = 15, FENETRE_REFUS = 30 * 60_000;
// Mode « recalcul » : on refait les fiches à partir du cache, sans aucune nouvelle requête iNaturalist
let HORS_LIGNE = false;

/** Requête avec cache disque, cadence lente et nouvelles tentatives */
async function get(url, { pause = PAUSE_INAT, compte = true } = {}) {
  const f = join(CACHE, createHash('sha1').update(url).digest('hex') + '.json');
  if (existsSync(f)) return lireJson(f, null);
  if (HORS_LIGNE && compte) throw new Error('donnée absente du cache (recalcul impossible pour ce pays)');
  if (compte) {
    cpt = compteur();
    if (cpt.n >= LIMITE_JOUR) throw new LimiteAtteinte();
  }
  for (let essai = 1; ; essai++) {
    await dormir(pause);
    try {
      const r = await fetch(url, { headers: UA });
      if (r.status === 429 || r.status >= 500) {
        if (compte && r.status === 429) {
          const t = Date.now(); refus = refus.filter(x => t - x < FENETRE_REFUS); refus.push(t);
          if (refus.length >= SEUIL_REFUS) throw new ServeurBloque();
        }
        const attente = Math.min(15 * 60_000, 30_000 * essai);
        log(`  serveur saturé (${r.status}), pause de ${Math.round(attente / 1000)} s…`);
        await dormir(attente); continue;
      }
      if (!r.ok) { log(`  réponse ${r.status} pour ${url.slice(0, 140)}`); return null }
      const j = await r.json();
      if (compte) { cpt.n++; ecrireJson(fichierCompteur, cpt) }
      ecrireJson(f, j);
      return j;
    } catch (e) {
      if (e instanceof ServeurBloque) throw e;
      if (essai >= 8) { log(`  abandon après 8 essais : ${e.message}`); return null }
      log(`  réseau indisponible (${e.message}), nouvel essai dans ${essai * 20} s…`);
      await dormir(essai * 20_000);
    }
  }
}

// ---------------------------------------------------------------------
// 1. Inventaire des espèces du pays (découpé automatiquement : iNaturalist plafonne à 10 000 résultats)
// ---------------------------------------------------------------------
const filtre = (place, extra = '') => `observations/species_counts?place_id=${place}&quality_grade=research&rank=species&locale=fr&per_page=${PAR_PAGE}${extra}`;

/** Renvoie les « feuilles » : groupes d'animaux de moins de 10 000 espèces (au-dessus du seuil d'observations) */
async function feuilles(place, taxon = 1, nom = 'Animaux', seuil = 0) {
  const p1 = await get(INAT + filtre(place, `&taxon_id=${taxon}&page=1`));
  const total = p1?.total_results || 0;
  if (total <= PLAFOND) return total ? [{ taxon, nom, total }] : [];
  if (seuil) {
    // résultats triés par nombre d'observations : si la 10 000e espèce est sous le seuil, inutile de découper
    const p20 = await get(INAT + filtre(place, `&taxon_id=${taxon}&page=${PLAFOND / PAR_PAGE}`));
    const dernier = p20?.results?.at(-1)?.count ?? 0;
    if (dernier < seuil) return [{ taxon, nom, total }];
  }
  const t = await get(INAT + `taxa/${taxon}?locale=fr`);
  const enfants = (t?.results?.[0]?.children || []).filter(c => c.is_active !== false);
  const out = [];
  for (const c of enfants) out.push(...await feuilles(place, c.id, c.name, seuil));
  return out;
}

/** Toutes les pages d'un groupe ; avec un seuil, on s'arrête dès que les espèces passent sous le seuil */
async function toutesLesPages(place, f, extra = '', seuil = 0) {
  const res = [];
  for (let page = 1; ; page++) {
    const j = await get(INAT + filtre(place, `&taxon_id=${f.taxon}${extra}&page=${page}`));
    if (!j?.results?.length) break;
    res.push(...j.results.filter(r => r.count >= seuil));
    if (seuil && j.results.at(-1).count < seuil) break;
    if (page * PAR_PAGE >= j.total_results || page * PAR_PAGE >= PLAFOND) break;
  }
  return res;
}

// ---------------------------------------------------------------------
// 2. Classement du jeu : classe, milieux, activité, archétype, rareté
// ---------------------------------------------------------------------
const NUIT = '&hour=21,22,23,0,1,2,3,4', CREPUSCULE = '&hour=5,6,7,18,19,20';
function classeJeu(anc) {
  const c = anc.class || '', o = anc.order || '';
  if (c === 'Mammalia') return 'M';
  if (c === 'Aves') return 'O';
  if (c === 'Reptilia' || c === 'Squamata' || c === 'Testudines' || c === 'Crocodylia') return 'R';
  if (c === 'Amphibia') return 'A';
  if (['Actinopterygii', 'Elasmobranchii', 'Holocephali', 'Petromyzonti', 'Myxini', 'Sarcopterygii', 'Chondrichthyes'].includes(c) || anc.superclass === 'Actinopterygii' || anc.subphylum === 'Vertebrata' && !c) return 'P';
  if (c === 'Insecta') return 'I';
  if (c === 'Arachnida') return 'K';
  void o; return 'X';
}
const a = (n, ...mots) => mots.some(m => n.includes(m));
const MARINS = new Set(['Delphinidae', 'Balaenopteridae', 'Phocoenidae', 'Physeteridae', 'Ziphiidae', 'Kogiidae', 'Phocidae', 'Otariidae', 'Odobenidae', 'Cheloniidae', 'Dermochelyidae', 'Hydrophiidae', 'Alcidae', 'Procellariidae', 'Hydrobatidae', 'Oceanitidae', 'Sulidae', 'Diomedeidae', 'Stercorariidae', 'Spheniscidae', 'Fregatidae', 'Phaethontidae', 'Gaviidae', 'Haematopodidae']);
const EAU_DOUCE_POISSONS = new Set(['Cyprinidae', 'Leuciscidae', 'Cobitidae', 'Nemacheilidae', 'Esocidae', 'Percidae', 'Centrarchidae', 'Salmonidae', 'Ictaluridae', 'Siluridae', 'Cichlidae', 'Characidae', 'Poeciliidae', 'Gobionidae', 'Acheilognathidae', 'Tincidae', 'Lotidae', 'Cottidae', 'Gasterosteidae', 'Petromyzontidae', 'Anguillidae', 'Loricariidae', 'Callichthyidae', 'Catostomidae', 'Clariidae', 'Mormyridae', 'Osteoglossidae', 'Serrasalmidae']);
const AQUATIQUES_INSECTES = new Set(['Odonata', 'Ephemeroptera', 'Plecoptera', 'Trichoptera', 'Megaloptera']);
const VILLE = new Set(['Columbidae', 'Passeridae', 'Sturnidae', 'Apodidae', 'Hirundinidae', 'Muridae', 'Blattidae', 'Ectobiidae', 'Culicidae', 'Muscidae', 'Gekkonidae', 'Psittacidae', 'Psittaculidae', 'Corvidae']);

/** Milieux (F forêt, P prairie, H zone humide, M montagne, V ville, L littoral) — règles par famille + mots du nom */
function milieux(classe, anc, nom) {
  const f = anc.family || '', o = anc.order || '', n = (nom || '').toLowerCase();
  const m = new Set();
  if (a(n, 'des montagnes', 'alpin', 'des alpes', 'des pyrénées', 'des neiges', 'des rochers', 'montagnard', 'des cimes', 'des glaciers')) m.add('M');
  if (a(n, 'des marais', 'des roseaux', 'des étangs', 'des ruisseaux', 'aquatique', "d'eau", 'des rivières', 'des lacs', 'palustre')) m.add('H');
  if (a(n, 'marin', 'de mer', 'des mers', 'des sables', 'des dunes', 'des côtes', 'littoral', 'côtier', 'des plages', 'océan')) m.add('L');
  if (a(n, 'des bois', 'forestier', 'des forêts', 'des chênes', 'des pins', 'arboricole')) m.add('F');
  if (a(n, 'des champs', 'des prés', 'des prairies', 'des steppes', 'des savanes', 'des déserts', 'des garrigues')) m.add('P');
  if (a(n, 'domestique', 'des villes', 'des maisons', 'des jardins', 'commun des villes')) m.add('V');
  if (MARINS.has(f)) m.add('L');
  if (VILLE.has(f)) m.add('V');
  if (classe === 'P') m.add(EAU_DOUCE_POISSONS.has(f) ? 'H' : 'L');
  if (classe === 'A') m.add('H');
  if (classe === 'O') {
    if (a(f, 'Anatidae', 'Ardeidae', 'Rallidae', 'Podicipedidae', 'Threskiornithidae', 'Ciconiidae', 'Alcedinidae', 'Acrocephalidae', 'Scolopacidae', 'Recurvirostridae', 'Jacanidae', 'Anhingidae', 'Phalacrocoracidae', 'Pelecanidae')) m.add('H');
    if (a(f, 'Laridae', 'Charadriidae')) { m.add('L'); m.add('H') }
    if (a(f, 'Picidae', 'Paridae', 'Sittidae', 'Certhiidae', 'Regulidae', 'Phylloscopidae', 'Strigidae', 'Trogonidae', 'Bucerotidae', 'Pittidae')) m.add('F');
    if (a(f, 'Alaudidae', 'Motacillidae', 'Emberizidae', 'Phasianidae', 'Otididae', 'Burhinidae', 'Falconidae', 'Accipitridae', 'Laniidae', 'Struthionidae', 'Rheidae')) m.add('P');
  }
  if (classe === 'M') {
    if (a(f, 'Cervidae', 'Suidae', 'Sciuridae', 'Ursidae', 'Felidae', 'Viverridae', 'Gliridae')) m.add('F');
    if (a(f, 'Leporidae', 'Equidae', 'Hyaenidae', 'Giraffidae', 'Rhinocerotidae', 'Elephantidae')) m.add('P');
    if (a(f, 'Castoridae', 'Hippopotamidae') || a(n, 'loutre', 'castor', 'rat musqué', 'ragondin', 'desman', 'campagnol amphibie')) m.add('H');
    if (o === 'Chiroptera') { m.add('F'); m.add('V') }
    if (f === 'Bovidae' && a(n, 'bouquetin', 'chamois', 'isard', 'mouflon', 'chèvre')) m.add('M');
  }
  if (classe === 'R') { if (a(f, 'Natricidae') || a(n, "d'eau", 'cistude', 'émyde', 'crocodile', 'alligator', 'caïman')) m.add('H'); if (a(f, 'Gekkonidae')) m.add('V') }
  if (classe === 'I') {
    if (AQUATIQUES_INSECTES.has(o) || a(f, 'Dytiscidae', 'Gyrinidae', 'Notonectidae', 'Gerridae', 'Nepidae', 'Hydrophilidae', 'Culicidae')) m.add('H');
    if (a(o, 'Orthoptera') || a(f, 'Apidae', 'Papilionidae', 'Pieridae', 'Lycaenidae', 'Nymphalidae', 'Coccinellidae', 'Syrphidae')) m.add('P');
    if (a(f, 'Cerambycidae', 'Lucanidae', 'Scolytidae', 'Buprestidae', 'Siricidae', 'Geometridae', 'Notodontidae')) m.add('F');
  }
  if (classe === 'K' && a(o, 'Scorpiones')) m.add('P');
  if (classe === 'X') {
    const c = anc.class || '';
    if (['Bivalvia', 'Cephalopoda', 'Anthozoa', 'Hydrozoa', 'Scyphozoa', 'Echinoidea', 'Asteroidea', 'Ophiuroidea', 'Holothuroidea', 'Polyplacophora', 'Ascidiacea', 'Thecostraca', 'Polychaeta'].includes(c)) m.add('L');
    if (c === 'Malacostraca') m.add(a(o, 'Isopoda') ? 'F' : 'L');
    if (c === 'Gastropoda') m.add(a(n, 'mer', 'patelle', 'bigorneau', 'murex', 'porcelaine', 'aplysie', 'doris', 'nudibranche') ? 'L' : 'F');
    if (['Clitellata', 'Diplopoda', 'Chilopoda', 'Collembola'].includes(c)) m.add('F');
  }
  if (!m.size) m.add(classe === 'P' ? 'H' : classe === 'O' || classe === 'I' ? 'FP' : 'F');
  return [...m].join('').split('').filter((x, i, t) => t.indexOf(x) === i).join('').slice(0, 3);
}

/** Activité : D diurne, N nocturne, C crépusculaire — mesurée sur les heures d'observation, corrigée par la famille */
function activite(classe, anc, total, nuit, crep) {
  const o = anc.order || '', f = anc.family || '';
  if (o === 'Chiroptera' || o === 'Strigiformes' || o === 'Caprimulgiformes' || f === 'Tytonidae') return 'N';
  if (classe === 'O' || o === 'Odonata' || a(f, 'Papilionidae', 'Pieridae', 'Nymphalidae', 'Lycaenidae', 'Hesperiidae', 'Apidae', 'Sciuridae')) return 'D';
  if (total >= 8) { const rn = nuit / total, rc = crep / total; if (rn >= 0.4) return 'N'; if (rn + rc >= 0.45 || rc >= 0.3) return 'C'; return 'D' }
  if (classe === 'A' || o === 'Scorpiones') return 'N';
  if (classe === 'M') return 'C';
  if (o === 'Lepidoptera') return 'N';
  return 'D';
}

/** Archétype de combat : p prédateur, g costaud, f rapide, a cuirassé, v venimeux, n en groupe, o opportuniste */
function archetype(classe, anc, masse) {
  const o = anc.order || '', f = anc.family || '', c = anc.class || '';
  if (classe === 'K') return o === 'Scorpiones' || f === 'Theridiidae' ? 'v' : 'p';
  if (classe === 'R') return a(f, 'Viperidae', 'Elapidae') ? 'v' : a(c + o, 'Testudines') || a(f, 'Testudinidae', 'Emydidae', 'Cheloniidae', 'Crocodylidae', 'Alligatoridae') ? 'a' : 'p';
  if (classe === 'A') return a(f, 'Salamandridae', 'Bufonidae', 'Dendrobatidae') ? 'v' : 'f';
  if (classe === 'P') return c === 'Elasmobranchii' || a(f, 'Esocidae', 'Percidae', 'Sphyraenidae', 'Serrasalmidae') ? 'p' : a(f, 'Clupeidae', 'Engraulidae', 'Scombridae') ? 'n' : a(f, 'Scorpaenidae', 'Trachinidae', 'Synanceiidae') ? 'v' : 'f';
  if (classe === 'M') {
    if (o === 'Carnivora' && !a(f, 'Ursidae')) return 'p';
    if (a(f, 'Erinaceidae', 'Dasypodidae', 'Manidae') || o === 'Cingulata') return 'a';
    if (masse >= 40000 || a(f, 'Bovidae', 'Ursidae', 'Suidae', 'Rhinocerotidae', 'Elephantidae', 'Hippopotamidae')) return 'g';
    if (o === 'Chiroptera' || a(f, 'Leporidae', 'Cervidae', 'Sciuridae')) return 'f';
    if (o === 'Cetacea' || a(f, 'Delphinidae')) return 'n';
    return 'o';
  }
  if (classe === 'O') {
    if (o === 'Accipitriformes' || o === 'Falconiformes' || o === 'Strigiformes') return 'p';
    if (a(f, 'Sturnidae', 'Laridae', 'Anatidae', 'Fringillidae', 'Passeridae', 'Psittacidae')) return 'n';
    if (a(f, 'Corvidae', 'Ardeidae', 'Ciconiidae')) return 'o';
    if (masse >= 3000) return 'g';
    return 'f';
  }
  if (classe === 'I') {
    if (a(f, 'Vespidae', 'Apidae') && !a(f, 'Andrenidae')) return 'v';
    if (a(f, 'Formicidae', 'Termitidae')) return 'n';
    if (o === 'Odonata' || a(f, 'Mantidae', 'Carabidae', 'Asilidae', 'Cicindelidae')) return 'p';
    if (o === 'Coleoptera') return 'a';
    if (o === 'Lepidoptera' || o === 'Diptera') return 'f';
    return 'o';
  }
  if (a(c, 'Bivalvia', 'Gastropoda', 'Malacostraca', 'Echinoidea')) return 'a';
  if (a(c, 'Cephalopoda', 'Chilopoda')) return 'p';
  if (a(c, 'Scyphozoa', 'Hydrozoa', 'Anthozoa', 'Cubozoa')) return 'v';
  return 'o';
}
const MASSE_DEFAUT = { M: 1000, O: 100, R: 100, A: 30, P: 500, I: 0.5, K: 0.5, X: 30 };
// Poids typique par ordre (ou famille) quand Wikidata n'a pas le poids adulte
const MASSE_GROUPE = {
  Passeriformes: 25, Corvidae: 400, Columbiformes: 300, Anseriformes: 1200, Accipitriformes: 1500, Falconiformes: 400,
  Strigiformes: 450, Galliformes: 600, Charadriiformes: 250, Laridae: 700, Pelecaniformes: 1500, Ciconiiformes: 3500,
  Gruiformes: 500, Piciformes: 100, Apodiformes: 30, Coraciiformes: 80, Cuculiformes: 110, Suliformes: 2000,
  Procellariiformes: 600, Podicipediformes: 700, Gaviiformes: 2500, Psittaciformes: 300, Phoenicopteriformes: 3000,
  Chiroptera: 15, Rodentia: 120, Eulipotyphla: 20, Lagomorpha: 2500, Carnivora: 5000, Mustelidae: 1200, Felidae: 6000,
  Ursidae: 150000, Canidae: 10000, Artiodactyla: 60000, Perissodactyla: 300000, Primates: 6000, Cetacea: 400000,
  Pinnipedia: 100000, Didelphimorphia: 2000, Diprotodontia: 20000, Proboscidea: 4000000,
  Testudines: 2000, Squamata: 60, Serpentes: 300, Crocodylia: 150000, Anura: 30, Caudata: 15,
};
const masseTypique = (classe, anc) => MASSE_GROUPE[anc.family] || MASSE_GROUPE[anc.suborder] || MASSE_GROUPE[anc.order] || MASSE_DEFAUT[classe];

/** Mois de présence (null = toute l'année) */
function mois(parMois) {
  const tot = parMois.reduce((s, x) => s + x, 0); if (tot < 12) return null;
  const max = Math.max(...parMois); const m = [];
  parMois.forEach((x, i) => { if (x >= Math.max(1, max * 0.08)) m.push(i + 1) });
  return m.length >= 10 ? null : m;
}

/** Rareté dans le pays : par classe, moins observé (pays + monde) + plus célèbre + menacé = plus rare (quotas 50/25/15/8/2 %) */
function raretes(liste) {
  const parClasse = {};
  for (const s of liste) (parClasse[s.classe] ||= []).push(s);
  const z = (v) => { const m = v.reduce((a, b) => a + b, 0) / v.length; const sd = Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / v.length) || 1; return v.map(x => (x - m) / sd) };
  const BONUS = { NT: 0.3, VU: 0.6, EN: 1, CR: 1.4 };
  for (const g of Object.values(parClasse)) {
    // rare = peu observé dans le pays ET dans le monde, plutôt célèbre, menacé
    const zo = z(g.map(s => Math.log(1 + s.obs))), zm = z(g.map(s => Math.log(1 + (s.mondial || s.obs))));
    const zn = z(g.map(s => Math.log(1 + (s.notoriete || 0))));
    const wPays = g.length >= 150 ? 0.45 : 0.25;       // petit pays : ses chiffres comptent moins
    g.forEach((s, i) => { s._score = -wPays * zo[i] - (0.7 - wPays) * zm[i] + 0.3 * zn[i] + (BONUS[s.uicn] || 0) });
    g.sort((x, y) => y._score - x._score);
    const n = g.length, q = [0.02, 0.08, 0.15, 0.25];
    let i = 0; const seuils = q.map(p => (i += Math.max(p > 0.02 || n >= 30 ? 1 : 0, Math.round(n * p))));
    g.forEach((s, k) => { s.tier = k < seuils[0] ? 4 : k < seuils[1] ? 3 : k < seuils[2] ? 2 : k < seuils[3] ? 1 : 0; delete s._score });
  }
}

// ---------------------------------------------------------------------
// 3. Détails des espèces retenues (famille, photos libres, statut UICN) — par lots de 30
// ---------------------------------------------------------------------
const UICN = { 10: 'LC', 20: 'NT', 30: 'VU', 40: 'EN', 50: 'CR', 60: 'EW', 70: 'EX' };
function photoLibre(t) {
  const cands = [t.default_photo, ...(t.taxon_photos || []).map(p => p.photo)].filter(Boolean);
  const p = cands.find(p => p.license_code && /^cc/.test(p.license_code) && (p.medium_url || p.url));
  if (!p) return null;
  const url = (p.medium_url || p.url.replace('square', 'medium'));
  return { url, credit: p.attribution, licence: p.license_code, page: `https://www.inaturalist.org/photos/${p.id}` };
}
async function details(ids) {
  const out = {};
  for (let i = 0; i < ids.length; i += 30) {
    const lot = ids.slice(i, i + 30);
    const j = await get(INAT + `taxa/${lot.join(',')}?locale=fr`);
    for (const t of j?.results || []) {
      const anc = {}; for (const x of t.ancestors || []) anc[x.rank] = x.name;
      const st = (t.conservation_statuses || []).find(c => /IUCN/i.test(c.authority || '')) || (t.conservation_statuses || [])[0];
      out[t.id] = { anc, photo: photoLibre(t), uicn: st?.iucn ? UICN[st.iucn] : null, wiki: t.wikipedia_url || null, nom: t.preferred_common_name || null, mondial: t.observations_count || 0 };
    }
    if (i % 600 === 0 && i) log(`    détails : ${i}/${ids.length}`);
  }
  return out;
}

// Wikidata : masse et notoriété (nombre de Wikipédia) via l'identifiant iNaturalist (P3151)
async function wikidata(ids) {
  const out = {};
  for (let i = 0; i < ids.length; i += 150) {
    const lot = ids.slice(i, i + 150).map(x => `"${x}"`).join(' ');
    const q = `SELECT ?inat (MAX(?m) AS ?masse) (MAX(?sl) AS ?liens) WHERE { VALUES ?inat { ${lot} } ?it wdt:P3151 ?inat . OPTIONAL { ?it wikibase:sitelinks ?sl } OPTIONAL { ?it p:P2067 ?st . ?st psv:P2067 [ wikibase:quantityAmount ?mv ; wikibase:quantityUnit ?u ] . FILTER NOT EXISTS { ?st pq:P3831 ?role } FILTER NOT EXISTS { ?st pq:P518 ?partie } BIND(IF(?u = wd:Q11570, ?mv * 1000, IF(?u = wd:Q41803, ?mv, IF(?u = wd:Q191118, ?mv * 1000000, ?mv))) AS ?m) } } GROUP BY ?inat`;
    const j = await get('https://query.wikidata.org/sparql?format=json&query=' + encodeURIComponent(q), { pause: PAUSE_WIKIDATA, compte: false });
    if (!j) throw new Error('Wikidata ne répond pas (poids et notoriété indisponibles)');
    for (const b of j?.results?.bindings || []) out[b.inat.value] = { masse: b.masse ? Math.round(+b.masse.value) : null, liens: b.liens ? +b.liens.value : 0 };
  }
  return out;
}

// ---------------------------------------------------------------------
// 4. Construire une liste (un pays, ou un groupe de pays en mode rapide)
// ---------------------------------------------------------------------
function existantFrance() {
  // Les espèces déjà réglées à la main gardent leurs réglages (rareté, milieux, mois…)
  const f = join(RACINE, 'bestiaire-app', 'src', 'data', 'species.json');
  const m = {}; for (const s of lireJson(f, [])) if (!s.pays) m[s.sci.toLowerCase()] = s; return m;
}

// Mode rapide (zones) : seuils d'observations, heures sur l'ensemble des animaux, mois pour les vertébrés seulement
const SEUIL_COMPLET = 10, SEUIL_AUTRES = 30, VERTEBRES = 355675;

/**
 * cfg = { code, nom, place: "id" ou "id1,id2,…", fin: fichier de sortie, rapide, france }
 */
async function construire(cfg) {
  const { place, rapide } = cfg;
  const seuil = rapide ? SEUIL_COMPLET : 0;
  const f = await feuilles(place, 1, 'Animaux', seuil);
  log(`  ${f.reduce((s, x) => s + x.total, 0)} espèces animales observées, en ${f.length} groupe(s)`);
  // a) liste + nombre d'observations (avec nom français si disponible)
  const base = {};
  for (const x of f) for (const r of await toutesLesPages(place, x, '', seuil)) base[r.taxon.id] = { t: r.taxon, obs: r.count, nuit: 0, crep: 0, mois: Array(12).fill(0) };
  log(`  ${Object.keys(base).length} espèces retenues pour la suite`);
  // b) heures d'observation et mois
  if (rapide) {
    const tout = { taxon: 1 }, vert = { taxon: VERTEBRES };
    for (const r of await toutesLesPages(place, tout, NUIT, 2)) if (base[r.taxon.id]) base[r.taxon.id].nuit = r.count;
    for (const r of await toutesLesPages(place, tout, CREPUSCULE, 2)) if (base[r.taxon.id]) base[r.taxon.id].crep = r.count;
    for (let m = 1; m <= 12; m++) for (const r of await toutesLesPages(place, vert, `&month=${m}`, 2)) if (base[r.taxon.id]) base[r.taxon.id].mois[m - 1] = r.count;
  } else {
    for (const x of f) {
      for (const r of await toutesLesPages(place, x, NUIT)) if (base[r.taxon.id]) base[r.taxon.id].nuit = r.count;
      for (const r of await toutesLesPages(place, x, CREPUSCULE)) if (base[r.taxon.id]) base[r.taxon.id].crep = r.count;
      for (let m = 1; m <= 12; m++) for (const r of await toutesLesPages(place, x, `&month=${m}`)) if (base[r.taxon.id]) base[r.taxon.id].mois[m - 1] = r.count;
    }
  }
  // c) premier tri avant les détails : classes complètes ou nom français (+ seuil des « autres » en mode rapide)
  const VERT = /Mammalia|Reptilia|Amphibia|Actinopterygii|Arachnida/;
  const complet = b => VERT.test(b.t.iconic_taxon_name || '') || (b.t.ancestor_ids || []).includes(47273) || (b.t.ancestor_ids || []).includes(47178);
  const candidats = Object.values(base).filter(b => complet(b) || (b.t.preferred_common_name && (!rapide || b.obs >= SEUIL_AUTRES)));
  log(`  ${candidats.length} candidates, lecture des détails…`);
  const det = await details(candidats.map(b => b.t.id));
  const wd = await wikidata(candidats.map(b => String(b.t.id)));
  const deja = cfg.france ? existantFrance() : {};
  // d) fiches du jeu
  const liste = [];
  for (const b of candidats) {
    const d = det[b.t.id]; if (!d) continue;
    const classe = classeJeu(d.anc);
    const nom = d.nom || b.t.preferred_common_name || null;
    if (!d.photo) continue;                                        // pas de photo libre : pas de carte
    if (!CLASSES_COMPLETES.has(classe) && !nom) continue;          // autres animaux : nom français obligatoire
    if (rapide && !CLASSES_COMPLETES.has(classe) && b.obs < SEUIL_AUTRES) continue;
    const sci = b.t.name, w = wd[String(b.t.id)] || {};
    const masse = w.masse || masseTypique(classe, d.anc);
    const ex = deja[sci.toLowerCase()];
    const vertebre = ['M', 'O', 'R', 'A', 'P'].includes(classe);
    liste.push({
      id: ex?.id || slug(sci), inat: b.t.id, nom: nom || sci, sci, classe,
      ordre: d.anc.order || null, famille: d.anc.family || null,
      obs: b.obs, mondial: d.mondial, notoriete: w.liens || 0, uicn: d.uicn,
      biomes: ex ? ex.b : milieux(classe, d.anc, nom),
      act: ex ? ex.a : activite(classe, d.anc, b.obs, b.nuit, b.crep),
      mois: ex ? ex.m : (rapide && !vertebre ? null : mois(b.mois)),
      masse_g: ex ? ex.g : masse, arch: ex ? ex.r : archetype(classe, d.anc, masse),
      photo: d.photo, wiki: d.wiki, garde: !!ex, tierFixe: ex ? ex.t : null,
    });
  }
  raretes(liste);
  for (const s of liste) { if (s.tierFixe != null) s.tier = s.tierFixe; delete s.tierFixe }
  return liste;
}

const compterClasses = l => { const o = {}; for (const s of l) o[s.classe] = (o[s.classe] || 0) + 1; return o };

async function pays(code, refaire = false) {
  const p = PLACES[code]; if (!p) { log(`Code pays inconnu : ${code}`); return 'inconnu' }
  const fin = join(SORTIE, `${code}.json`);
  if (existsSync(fin) && !refaire) { log(`${code} (${p.fr}) déjà collecté — fichier ${fin}`); return 'fait' }
  log(`=== ${code} · ${p.fr} (iNaturalist ${p.id}) ===`);
  const liste = await construire({ code, place: String(p.id), france: code === 'FR' });
  ecrireJson(fin, { pays: code, nom: p.fr, place: p.id, date: new Date().toISOString(), total: liste.length, parClasse: compterClasses(liste), especes: liste });
  log(`  ✓ ${code} terminé : ${liste.length} espèces jouables ${JSON.stringify(compterClasses(liste))} → ${fin}`);
  return 'fait';
}

// ---------------------------------------------------------------------
// 5. Zones du jeu : France à part + 8 grandes zones
//    Une zone = fusion des pays déjà collectés en détail + une collecte rapide groupée des autres pays.
// ---------------------------------------------------------------------
const ZONES = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'zones.json'), 'utf8'));
const DOSSIER_ZONES = join(DOSSIER, 'zones'); mkdirSync(DOSSIER_ZONES, { recursive: true });

/** Fusionne plusieurs listes : observations additionnées, réglages pris dans la liste où l'espèce est la plus observée */
function fusionner(listes) {
  const m = new Map();
  for (const l of listes) for (const s of l) {
    const e = m.get(s.inat);
    if (!e) { m.set(s.inat, { ...s, _max: s.obs }); continue }
    const total = e.obs + s.obs;
    if (s.obs > e._max) { Object.assign(e, s, { _max: s.obs }) }
    e.obs = total; e.garde = e.garde || s.garde;
  }
  return [...m.values()].map(s => { delete s._max; return s });
}

async function zone(code, refaire = false) {
  const z = ZONES[code]; if (!z) { log(`Zone inconnue : ${code}`); return }
  const fin = join(DOSSIER_ZONES, `${code}.json`);
  if (existsSync(fin) && !refaire) { log(`Zone ${code} (${z.nom}) déjà prête — ${fin}`); return }
  log(`=== Zone ${code} · ${z.nom} ===`);
  let liste;
  if (code === 'FR') {
    // France : liste détaillée complète (réglages faits à la main conservés)
    const fr = await (async () => { const old = HORS_LIGNE; HORS_LIGNE = true; try { await pays('FR', true) } finally { HORS_LIGNE = old } return lireJson(join(SORTIE, 'FR.json'), null) })();
    liste = fr.especes;
  } else {
    const detailles = z.pays.filter(c => existsSync(join(SORTIE, `${c}.json`)));
    const aCollecter = z.pays.filter(c => !detailles.includes(c) && !(z.sansCollecte || []).includes(c));
    const listes = [];
    // a) pays déjà collectés en détail : recalcul depuis le cache (poids, rareté) puis fusion
    for (const c of detailles) {
      const old = HORS_LIGNE; HORS_LIGNE = true;
      try { await pays(c, true) } catch (e) { log(`  (recalcul ${c} impossible : ${e.message} — ancienne liste utilisée)`) } finally { HORS_LIGNE = old }
      listes.push(lireJson(join(SORTIE, `${c}.json`), { especes: [] }).especes);
    }
    if (detailles.length) log(`  ${detailles.length} pays déjà détaillés fusionnés : ${detailles.join(', ')}`);
    // b) les autres pays de la zone : une seule collecte rapide groupée
    if (aCollecter.length) {
      const ids = aCollecter.map(c => PLACES[c].id).join(',');
      log(`  collecte rapide groupée de ${aCollecter.length} pays : ${aCollecter.join(', ')}`);
      listes.push(await construire({ code, place: ids, rapide: true }));
    }
    liste = fusionner(listes)
      .filter(s => s.obs >= (CLASSES_COMPLETES.has(s.classe) ? SEUIL_COMPLET : SEUIL_AUTRES) || s.garde);
    raretes(liste);
  }
  ecrireJson(fin, { zone: code, nom: z.nom, pays: z.pays, date: new Date().toISOString(), total: liste.length, parClasse: compterClasses(liste), especes: liste });
  log(`  ✓ Zone ${code} terminée : ${liste.length} espèces ${JSON.stringify(compterClasses(liste))} → ${fin}`);
}

// ---------------------------------------------------------------------
// Lancement
// ---------------------------------------------------------------------
const args = process.argv.slice(2).map(x => x.toUpperCase());
const USAGE = `Usage :
  node outils/collecte-especes.mjs zones          → les 9 zones du jeu (France + 8 grandes zones)
  node outils/collecte-especes.mjs zones EU AF    → seulement ces zones
  node outils/collecte-especes.mjs etat           → où en est la collecte
  node outils/collecte-especes.mjs recalcul       → refait les listes de pays depuis le cache
  node outils/collecte-especes.mjs FR BE          → collecte détaillée de pays précis`;
if (!args.length) { console.log(USAGE); process.exit(0) }
if (args[0] === 'ETAT') {
  const zf = Object.keys(ZONES).filter(c => existsSync(join(DOSSIER_ZONES, `${c}.json`)));
  console.log(`Zones prêtes : ${zf.length}/${Object.keys(ZONES).length} — ${zf.map(c => `${c} (${lireJson(join(DOSSIER_ZONES, `${c}.json`), {}).total} esp.)`).join(', ') || 'aucune'}`);
  const faits = Object.keys(PLACES).filter(c => existsSync(join(SORTIE, `${c}.json`)));
  console.log(`Pays détaillés : ${faits.length} — ${faits.join(', ') || 'aucun'}`);
  console.log(`Requêtes iNaturalist aujourd'hui : ${compteur().n}/${LIMITE_JOUR}`);
  process.exit(0);
}
const RECALCUL = args[0] === 'RECALCUL', MODE_ZONES = args[0] === 'ZONES';
if (RECALCUL) HORS_LIGNE = true;
let liste;
if (MODE_ZONES) liste = args.length > 1 ? args.slice(1) : Object.keys(ZONES);
else if (RECALCUL) liste = args.length > 1 ? args.slice(1) : Object.keys(PLACES).filter(c => existsSync(join(SORTIE, `${c}.json`)));
else if (args[0] === 'TOUS') { console.log('« tous » est remplacé par « zones » (bien plus rapide).\n' + USAGE); process.exit(0) }
else liste = args;
if (MODE_ZONES) log(`Démarrage des zones : ${liste.join(', ')}. Requêtes déjà faites aujourd'hui : ${compteur().n}/${LIMITE_JOUR}.`);
else if (RECALCUL) log(`Recalcul depuis le cache : ${liste.length} pays (poids, raretés…), sans requête iNaturalist.`);
else log(`Démarrage de la collecte : ${liste.length} pays. Requêtes déjà faites aujourd'hui : ${compteur().n}/${LIMITE_JOUR}.`);
try {
  for (const c of liste) {
    try { MODE_ZONES ? await zone(c) : await pays(c, RECALCUL) }
    catch (e) { if (e instanceof LimiteAtteinte || e instanceof ServeurBloque) throw e; log(`  ✗ ${c} : ${e.message} (on passe à la suite, relance plus tard pour le reprendre)`) }
  }
  log(RECALCUL ? 'Recalcul terminé.' : 'Collecte terminée.');
} catch (e) {
  if (e instanceof LimiteAtteinte) log(`Limite de ${LIMITE_JOUR} requêtes du jour atteinte : relance la même commande demain, la collecte reprendra où elle s'est arrêtée.`);
  else if (e instanceof ServeurBloque) log(`iNaturalist nous freine (trop de refus « 429 » en 30 min) : arrêt propre. Relance la même commande dans quelques heures, la collecte reprendra où elle s'est arrêtée.`);
  else { log('Erreur : ' + e.message); process.exitCode = 1 }
}
