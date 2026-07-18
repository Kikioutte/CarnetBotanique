#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPORTS = {
  desktop: path.join(ROOT, 'test-results/phase0/lighthouse-desktop.report.json'),
  mobile: path.join(ROOT, 'test-results/phase0/lighthouse-mobile.report.json'),
};
const thresholds = {
  desktop: { performance: 95, accessibility: 95, 'best-practices': 95, seo: 95 },
  mobile: { performance: 90, accessibility: 95, 'best-practices': 95, seo: 95 },
};
let failed = false;

for (const [device, file] of Object.entries(REPORTS)) {
  if (!fs.existsSync(file)) {
    console.error(`✗ Rapport Lighthouse ${device} introuvable : ${file}`);
    failed = true; continue;
  }
  const report = JSON.parse(fs.readFileSync(file, 'utf8'));
  console.log(`▶ Lighthouse ${device}`);
  for (const [category, minimum] of Object.entries(thresholds[device])) {
    const score = Math.round((report.categories[category]?.score || 0) * 100);
    const ok = score >= minimum;
    console.log(`  ${ok ? '✓' : '✗'} ${category}: ${score}/100 (minimum ${minimum})`);
    if (!ok) failed = true;
  }
  const metrics = ['first-contentful-paint', 'largest-contentful-paint', 'total-blocking-time'];
  metrics.forEach(id => console.log(`  · ${id}: ${report.audits[id]?.displayValue || 'n/a'}`));
}

const index = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const blockingThirdParty = [...index.matchAll(/<script[^>]+src=["']https?:\/\//gi)].length;
if (blockingThirdParty) {
  console.error(`✗ ${blockingThirdParty} script(s) tiers restent dans le HTML initial.`);
  failed = true;
} else {
  console.log('✓ Aucun script tiers dans le chemin de rendu initial.');
}

process.exit(failed ? 1 : 0);
