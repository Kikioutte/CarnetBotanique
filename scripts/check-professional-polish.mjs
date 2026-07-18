#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');
const css = read('css/styles.css');
const index = read('index.html');
const app = read('js/app.js');

const checks = [
  ['tokens Liquid Glass centralisés', /--liquid-surface:/, css],
  ['surface hero translucide', /\.hero-content\s*\{[\s\S]*?backdrop-filter:blur\(/, css],
  ['navigation flottante bornée au viewport', /header#mainHeader\s*\{[\s\S]*?max-width:calc\(100vw - 24px\)/, css],
  ['contraste de la carte accent préservé', /\.fusion-module\.accent b\s*\{color:var\(--cream\)\}/, css],
  ['reflets désactivés si animations réduites', /@media\(prefers-reduced-motion:reduce\)[\s\S]*?\.hero-content::before[\s\S]*?display:none/, css],
  ['reflet pointeur limité aux souris fines', /function initLiquidGlass\(\)[\s\S]*?\(hover:hover\) and \(pointer:fine\)/, app],
  ['reflet cadencé par requestAnimationFrame', /function initLiquidGlass\(\)[\s\S]*?requestAnimationFrame/, app],
  ['icônes réelles dans les onglets du formulaire', /id="formTab0"[^>]*>[\s\S]*?fa-book/, index],
  ['aucun emoji utilitaire dans les quatre onglets', !/[📋🌿🌱✂️]\s*(Général|Botanique|Culture|Pro)/.test(index), true],
];

let failed = false;
for (const [label, rule, source] of checks) {
  const ok = rule === true ? source === true : rule.test(source);
  console.log(`${ok ? '✓' : '✗'} ${label}`);
  if (!ok) failed = true;
}

process.exit(failed ? 1 : 0);
