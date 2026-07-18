#!/usr/bin/env node
/**
 * Contrôle qualité — fiabilité de livraison du service worker.
 *
 * Deux dérives détectées :
 *
 * 1. GÉNÉRATION : la VERSION déclarée dans sw.js (ex. hdv-v10) doit couvrir la
 *    génération la plus récente des fichiers js/extensions-v*.js. Une VERSION
 *    en retard signifie que le nom de cache n'a pas suivi l'application.
 *
 * 2. EMPREINTE DU SHELL : le navigateur ne réinstalle un service worker que si
 *    les octets de sw.js changent. Si un fichier du SHELL (index.html, CSS, JS,
 *    manifest, icônes…) change sans que sw.js change, les visiteurs déjà
 *    équipés gardent l'ancien cache shell (cache-first) et ne reçoivent JAMAIS
 *    la mise à jour. sw.js embarque donc SHELL_HASH, l'empreinte du contenu des
 *    fichiers du SHELL ; ce contrôle la recalcule et échoue si elle est
 *    périmée. `--fix` la met à jour dans sw.js.
 *
 * Usage :
 *   node scripts/check-sw-version.mjs            → baseline : consigne les écarts, sort en 0
 *   node scripts/check-sw-version.mjs --strict   → strict : sort en 1 au moindre écart (CI)
 *   node scripts/check-sw-version.mjs --fix      → met à jour SHELL_HASH dans sw.js
 *
 * Écrit toujours test-results/phase0/sw-version.json.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
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

  // Empreinte du shell : liste SHELL extraite de sw.js, contenus hachés.
  const declaredHash = (swSource.match(/const\s+SHELL_HASH\s*=\s*['"]([0-9a-f]+)['"]/) || [])[1] ?? null;
  const shellMatch = swSource.match(/const\s+SHELL\s*=\s*\[([\s\S]*?)\]/);
  let shellFiles = [], expectedHash = null, missingShellFiles = [];
  if (shellMatch) {
    shellFiles = [...shellMatch[1].matchAll(/['"]([^'"]+)['"]/g)]
      .map(x => (x[1] === './' ? 'index.html' : x[1]));
    shellFiles = [...new Set(shellFiles)];
    const h = crypto.createHash('sha256');
    for (const f of shellFiles) {
      const p = path.join(root, f);
      if (!fs.existsSync(p)) { missingShellFiles.push(f); continue; }
      h.update(f).update('\0').update(fs.readFileSync(p)).update('\0');
    }
    expectedHash = h.digest('hex').slice(0, 12);
  }

  const parseable = swGeneration !== null && latestExtensionGeneration !== null &&
    declaredHash !== null && expectedHash !== null && missingShellFiles.length === 0;
  const generationDrift = swGeneration !== null && latestExtensionGeneration !== null &&
    swGeneration < latestExtensionGeneration;
  const hashDrift = declaredHash !== null && expectedHash !== null && declaredHash !== expectedHash;
  const drift = !parseable || generationDrift || hashDrift;

  const problems = [];
  if (generationDrift) {
    problems.push(
      `La VERSION du service worker (« ${swVersion} », génération ${swGeneration}) est en retard sur la ` +
      `génération la plus récente des extensions (v${latestExtensionGeneration}). Le cache de la coquille ` +
      `étant nommé d'après VERSION et servi cache-first, un visiteur qui possède déjà l'ancien cache ` +
      `continue de recevoir l'ancienne coquille tant que VERSION n'est pas incrémentée.`);
  }
  if (hashDrift) {
    problems.push(
      `SHELL_HASH est périmée : sw.js déclare « ${declaredHash} » mais le contenu actuel des fichiers du ` +
      `shell donne « ${expectedHash} ». Sans changement d'octets de sw.js, aucun nouveau service worker ne ` +
      `s'installe chez les visiteurs : l'ancien shell resterait servi. Lancez ` +
      `« node scripts/check-sw-version.mjs --fix » puis committez sw.js.`);
  }
  if (missingShellFiles.length) {
    problems.push(`Fichiers du SHELL introuvables sur le disque : ${missingShellFiles.join(', ')}.`);
  }
  if (!parseable && !problems.length) {
    problems.push(`Impossible d'extraire VERSION, SHELL ou SHELL_HASH de sw.js — contrôle non concluant.`);
  }

  return {
    checkedAt: new Date().toISOString(),
    swFile: 'sw.js',
    swVersion,
    swGeneration,
    extensionFiles,
    latestExtensionGeneration,
    shellFiles,
    missingShellFiles,
    declaredShellHash: declaredHash,
    expectedShellHash: expectedHash,
    parseable,
    generationDrift,
    hashDrift,
    drift,
    explanation: drift
      ? problems.join(' ')
      : `La VERSION du service worker (« ${swVersion} ») couvre la génération la plus récente des extensions ` +
        `(v${latestExtensionGeneration}) et SHELL_HASH (« ${declaredHash} ») correspond au contenu actuel du shell.`,
  };
}

export function fixShellHash(root = ROOT) {
  const result = checkSwVersion(root);
  if (!result.expectedShellHash) throw new Error('Empreinte du shell incalculable — SHELL illisible dans sw.js');
  const p = path.join(root, 'sw.js');
  const src = fs.readFileSync(p, 'utf8');
  const updated = src.replace(/(const\s+SHELL_HASH\s*=\s*['"])[0-9a-f]*(['"])/, `$1${result.expectedShellHash}$2`);
  if (updated === src && result.hashDrift) throw new Error('SHELL_HASH introuvable dans sw.js — mise à jour impossible');
  fs.writeFileSync(p, updated);
  return result.expectedShellHash;
}

// Exécution en ligne de commande (pas lors d'un import par tests/phase0.mjs)
const invokedDirectly = process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  const strict = process.argv.includes('--strict');
  const fix = process.argv.includes('--fix');

  if (fix) {
    const hash = fixShellHash(ROOT);
    console.log(`SHELL_HASH mise à jour dans sw.js : ${hash}`);
  }
  const result = checkSwVersion(ROOT);

  const outDir = path.join(ROOT, 'test-results', 'phase0');
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'sw-version.json'), JSON.stringify(result, null, 2) + '\n');

  console.log('▶ Contrôle service worker (VERSION + empreinte du shell)');
  console.log(`  VERSION sw.js              : ${result.swVersion ?? 'introuvable'}`);
  console.log(`  Extensions détectées       : ${result.extensionFiles.join(', ') || 'aucune'}`);
  console.log(`  Génération la plus récente : v${result.latestExtensionGeneration ?? '?'}`);
  console.log(`  SHELL_HASH déclarée        : ${result.declaredShellHash ?? 'introuvable'}`);
  console.log(`  SHELL_HASH attendue        : ${result.expectedShellHash ?? 'incalculable'} (${result.shellFiles.length} fichiers)`);
  if (!result.parseable) {
    console.error('  ✗ ' + result.explanation);
    process.exit(1); // échec technique, même en baseline
  }
  if (result.drift) {
    console.log(`  ${strict ? '✗' : '⚠'} Écart détecté : ${result.explanation}`);
    process.exit(strict ? 1 : 0);
  }
  console.log('  ✓ Aucune dérive : VERSION alignée et SHELL_HASH à jour');
  process.exit(0);
}
