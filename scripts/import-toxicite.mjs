#!/usr/bin/env node
/**
 * Intègre dans plants.json un relevé de toxicité produit à partir de sources
 * vétérinaires (fichier CSV, cf. docs/TOXICITE.md).
 *
 * Règle non négociable : « non_toxique » n'est appliqué que si la ligne porte
 * une source. Une case laissée vide, un « inconnu », ou un statut sans source
 * ne touche PAS la fiche — elle reste « non renseignée ». C'est exactement
 * l'erreur d'origine du projet (321 fiches marquées « Non toxique » sans que
 * personne ne l'ait vérifié) qu'il s'agit de ne pas reproduire.
 *
 * Usage :
 *   node scripts/import-toxicite.mjs <fichier.csv> [--dry-run]
 *
 * Après import :  npm run build:seo && npm run build:assets
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const fichier = process.argv[2];
const dryRun = process.argv.includes('--dry-run');

if (!fichier) {
  console.error('Usage : node scripts/import-toxicite.mjs <fichier.csv> [--dry-run]');
  process.exit(2);
}

/* Analyseur CSV conforme RFC 4180 : les champs « detail » contiennent des
   virgules et des guillemets, un découpage naïf sur la virgule les casserait. */
function parseCSV(texte) {
  const t = texte.replace(/^\uFEFF/, ''); // BOM ajouté par les tableurs
  const lignes = [];
  let champ = '', ligne = [], dansGuillemets = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (dansGuillemets) {
      if (c === '"') {
        if (t[i + 1] === '"') { champ += '"'; i++; }
        else dansGuillemets = false;
      } else champ += c;
    } else if (c === '"') dansGuillemets = true;
    else if (c === ',') { ligne.push(champ); champ = ''; }
    else if (c === '\n') { ligne.push(champ); lignes.push(ligne); ligne = []; champ = ''; }
    else if (c !== '\r') champ += c;
  }
  if (champ.length || ligne.length) { ligne.push(champ); lignes.push(ligne); }
  return lignes.filter(l => l.length > 1 || (l[0] || '').trim());
}

const lignes = parseCSV(fs.readFileSync(fichier, 'utf8'));
const entetes = lignes.shift().map(h => h.trim().toLowerCase());
const col = nom => entetes.indexOf(nom);
for (const requis of ['id', 'statut']) {
  if (col(requis) < 0) { console.error(`Colonne « ${requis} » absente du fichier.`); process.exit(1); }
}

const plants = JSON.parse(fs.readFileSync(path.join(ROOT, 'plants.json'), 'utf8'));
const parId = new Map(plants.map(p => [p.id, p]));
const aujourdhui = new Date().toISOString().slice(0, 10);

const bilan = { toxique: 0, non_toxique: 0, ignore_sans_source: 0, inconnu: 0, id_absent: 0, inchange: 0 };
const refuses = [];

for (const l of lignes) {
  const id = (l[col('id')] || '').trim();
  if (!id) continue;
  const fiche = parId.get(id);
  if (!fiche) { bilan.id_absent++; refuses.push(`id inconnu : ${id}`); continue; }

  const statut = (l[col('statut')] || '').trim().toLowerCase();
  const source = col('source_url') >= 0 ? (l[col('source_url')] || '').trim() : '';
  const sourceNom = col('source_nom') >= 0 ? (l[col('source_nom')] || '').trim() : '';
  const detail = col('detail') >= 0 ? (l[col('detail')] || '').trim() : '';
  const animaux = col('animaux_concernes') >= 0 ? (l[col('animaux_concernes')] || '').trim() : '';

  if (!statut || statut === 'inconnu') { bilan.inconnu++; continue; }

  if (statut !== 'toxique' && statut !== 'non_toxique') {
    refuses.push(`${id} : statut « ${statut} » non reconnu`);
    continue;
  }

  // Le verrou : pas de source, pas d'écriture.
  if (!source) {
    bilan.ignore_sans_source++;
    refuses.push(`${id} : statut « ${statut} » sans source — ignoré`);
    continue;
  }

  const avant = JSON.stringify([fiche.toxPets, fiche.toxicite, fiche.toxDetail]);
  if (statut === 'toxique') {
    fiche.toxPets = 'toxic';
    fiche.toxicite = detail || 'Toxique — manipuler avec soin';
    fiche.toxDetail = detail || 'Toxique — manipuler avec soin';
  } else {
    fiche.toxPets = 'safe';
    fiche.toxicite = 'Non toxique';
    fiche.toxDetail = detail || '';
  }
  if (animaux) fiche.toxAnimaux = animaux;
  fiche.toxSource = sourceNom ? `${sourceNom} — ${source}` : source;
  fiche.toxSourceDate = aujourdhui;

  if (JSON.stringify([fiche.toxPets, fiche.toxicite, fiche.toxDetail]) === avant) bilan.inchange++;
  bilan[statut]++;
}

console.log('▶ Import du relevé de toxicité');
console.log(`  fichier : ${fichier}`);
console.log(`  fiches marquées toxiques      : ${bilan.toxique}`);
console.log(`  fiches marquées non toxiques  : ${bilan.non_toxique}`);
console.log(`  laissées « non renseignées »  : ${bilan.inconnu}`);
console.log(`  REFUSÉES faute de source      : ${bilan.ignore_sans_source}`);
console.log(`  identifiants introuvables     : ${bilan.id_absent}`);
if (refuses.length) {
  console.log('\n  Lignes non appliquées :');
  refuses.slice(0, 20).forEach(r => console.log('    · ' + r));
  if (refuses.length > 20) console.log(`    … et ${refuses.length - 20} autres`);
}

/* Cohérence inter-taxons : deux fiches de la même espèce ne peuvent pas
   diverger. Le contrôle bloque l'écriture plutôt que de livrer l'incohérence. */
const parTaxon = new Map();
for (const p of plants) {
  if (!parTaxon.has(p.nomLat)) parTaxon.set(p.nomLat, []);
  parTaxon.get(p.nomLat).push(p);
}
const divergences = [];
for (const [taxon, fiches] of parTaxon) {
  if (fiches.length < 2) continue;
  for (const champ of ['toxicite', 'toxPets']) {
    const valeurs = new Set(fiches.map(f => f[champ] || ''));
    if (valeurs.size > 1) divergences.push(`${taxon} · ${champ} : ${[...valeurs].join(' / ')}`);
  }
}
if (divergences.length) {
  console.error('\n✗ Contradictions entre fiches d’un même taxon — rien n’a été écrit :');
  divergences.forEach(d => console.error('    ' + d));
  console.error('  Corrigez ces lignes dans le fichier puis relancez.');
  process.exit(1);
}

if (dryRun) {
  console.log('\n· Simulation (--dry-run) : plants.json n’a pas été modifié.');
} else {
  fs.writeFileSync(path.join(ROOT, 'plants.json'), JSON.stringify(plants, null, 2) + '\n');
  console.log('\n✓ plants.json mis à jour. Lancez maintenant :');
  console.log('    npm run build:seo && npm run build:assets && npm run test:all');
}
