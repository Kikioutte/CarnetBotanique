#!/usr/bin/env node
/**
 * Choisit le rapport Lighthouse médian parmi plusieurs exécutions et l'écrit
 * sous le nom canonique attendu par les contrôles de budget.
 *
 * Pourquoi : le score de performance mobile dépend fortement de la charge de la
 * machine (émulation CPU 4x). Trois exécutions consécutives du même commit ont
 * été mesurées à 81, 97 et 97 — un portail bloquant sur une exécution unique
 * échoue donc au hasard, sans qu'aucune régression réelle soit en cause.
 * La médiane élimine l'exécution aberrante sans masquer une vraie dégradation.
 *
 * Usage :
 *   node scripts/lighthouse-median.mjs <sortie.report.json> <run1.json> <run2.json> …
 */
import fs from 'node:fs';

const [sortie, ...runs] = process.argv.slice(2);
if (!sortie || runs.length < 1) {
  console.error('Usage : node scripts/lighthouse-median.mjs <sortie> <run1> [run2 …]');
  process.exit(2);
}

const rapports = runs
  .filter(f => fs.existsSync(f))
  .map(f => {
    const json = JSON.parse(fs.readFileSync(f, 'utf8'));
    return { fichier: f, json, score: Math.round((json.categories?.performance?.score || 0) * 100) };
  });

if (!rapports.length) {
  console.error('Aucun rapport Lighthouse exploitable parmi : ' + runs.join(', '));
  process.exit(1);
}

rapports.sort((a, b) => a.score - b.score);
const median = rapports[Math.floor(rapports.length / 2)];

fs.writeFileSync(sortie, JSON.stringify(median.json));
console.log(`  scores : ${rapports.map(r => r.score).join(', ')} → médiane retenue : ${median.score} (${median.fichier})`);
