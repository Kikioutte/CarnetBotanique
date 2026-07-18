#!/usr/bin/env node
/**
 * Contrôle Phase 0 — dérive de version du service worker.
 *
 * Compare la VERSION déclarée dans sw.js (cache de la coquille applicative)
 * avec la génération la plus récente des fichiers js/extensions-v*.js.
 *
 * Si la VERSION du SW est en retard sur les extensions, les visiteurs déjà
 * équipés du SW continuent de recevoir l'ancienne coquille pré-cachée
 * (cache-first) : les nouveaux fichiers extensions ne sont jamais téléchargés
 * tant que la VERSION n'est pas incrémentée.
 *
 * Usage :
 *   node scripts/check-sw-version.mjs            → baseline : consigne l'écart, sort en 0
 *   node scripts/check-sw-version.mjs --strict   → strict : sort en 1 si écart détecté
 *
 * Écrit toujours test-results/phase0/sw-version.json.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

export function checkSwVersion(root = ROOT) {
  const swSource = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
  const m = swSource.match(/const\s+VERSION\s*=\s*['"]([^'"]+)['"]/);
  const swVersion = m ? m[1] : null;
  const swGenMatch = swVersion ? swVersion.match(/v(\d+)/) : null;
  const swGeneration = swGenMatch ? Number(swGenMatch[1]) : null;

  const extensionFiles = fs.readdirSync(path.join(root, 'js'))
    .filter(f => /^extensions-v(\d+)\.js$/.test(f))
    .sort((a, b) => Number(a.match(/v(\d+)/)[1]) - Number(b.match(/v(\d+)/)[1]));
  const latestExtensionGeneration = extensionFiles.length
    ? Number(extensionFiles[extensionFiles.length - 1].match(/v(\d+)/)[1])
    : null;

  const parseable = swGeneration !== null && latestExtensionGeneration !== null;
  const drift = parseable && swGeneration < latestExtensionGeneration;

  return {
    checkedAt: new Date().toISOString(),
    swFile: 'sw.js',
    swVersion,
    swGeneration,
    extensionFiles,
    latestExtensionGeneration,
    parseable,
    drift,
    explanation: drift
      ? `La VERSION du service worker (« ${swVersion} », génération ${swGeneration}) est en retard sur la ` +
        `génération la plus récente des extensions (v${latestExtensionGeneration}). Le cache de la coquille ` +
        `étant nommé d'après VERSION et servi cache-first, un visiteur qui possède déjà l'ancien cache ` +
        `« ${swVersion}-shell » continue de recevoir l'ancienne coquille (HTML/CSS/JS) : les fichiers ` +
        `extensions-v8/v9/v10 mis à jour ne lui parviennent jamais tant que VERSION n'est pas incrémentée.`
      : parseable
        ? `La VERSION du service worker (« ${swVersion} ») est alignée sur la génération la plus récente des extensions (v${latestExtensionGeneration}).`
        : `Impossible d'extraire la VERSION du SW ou la liste des extensions — contrôle non concluant.`,
  };
}

// Exécution en ligne de commande (pas lors d'un import par tests/phase0.mjs)
const invokedDirectly = process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  const strict = process.argv.includes('--strict');
  const result = checkSwVersion(ROOT);

  const outDir = path.join(ROOT, 'test-results', 'phase0');
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'sw-version.json'), JSON.stringify(result, null, 2) + '\n');

  console.log('▶ Contrôle service worker (sw.js VERSION vs extensions-v*.js)');
  console.log(`  VERSION sw.js           : ${result.swVersion ?? 'introuvable'}`);
  console.log(`  Extensions détectées    : ${result.extensionFiles.join(', ') || 'aucune'}`);
  console.log(`  Génération la plus récente : v${result.latestExtensionGeneration ?? '?'}`);
  if (!result.parseable) {
    console.error('  ✗ Contrôle non concluant (VERSION ou extensions illisibles)');
    process.exit(1); // échec technique, même en baseline
  }
  if (result.drift) {
    console.log(`  ${strict ? '✗' : '⚠'} Écart détecté : ${result.explanation}`);
    process.exit(strict ? 1 : 0);
  }
  console.log('  ✓ Aucune dérive de version détectée');
  process.exit(0);
}
