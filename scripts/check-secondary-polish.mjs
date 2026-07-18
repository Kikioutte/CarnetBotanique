#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');
const css = read('css/styles.css');
const index = read('index.html');
const app = read('js/app.js');
const extensionsV7 = read('js/extensions-v7.js');
const visibleCode = `${index}\n${app}\n${extensionsV7}`;

const checks = [
  ['tokens de mouvement centralisés', /--motion-fast:190ms;[\s\S]*?--ease-interface:/, css],
  ['tiroir réellement fixé au viewport', /Phase 6[\s\S]*?\.side-drawer\s*\{[\s\S]*?position:fixed/, css],
  ['fiche express réellement fixée au viewport', /Phase 6[\s\S]*?\.fusion-quick-sheet\s*\{[\s\S]*?position:fixed/, css],
  ['entrée commune des écrans secondaires', /body\.flash-on \.flashcard-overlay[\s\S]*?phase6BackdropIn/, css],
  ['entrée du contenu avec courbe interface', /@keyframes phase6SurfaceIn[\s\S]*?translateY\(18px\)/, css],
  ['animations neutralisées en mouvement réduit', /@media\(prefers-reduced-motion:reduce\)[\s\S]*?phase6SurfaceIn|@media\(prefers-reduced-motion:reduce\)[\s\S]*?\.form-tab-panel\.active\{animation:none/, css],
  ['cibles de fermeture de 44 px', /\.flash-close,\.quiz-close,\.cal-close,\.dash-close,\.care-close,[\s\S]*?min-width:44px;[\s\S]*?min-height:44px;/, css],
  ['surface secondaire Liquid Glass commune', /\.quiz-card,\.dash-stat,\.dash-mastery,\.cal-month,\.cal-item,[\s\S]*?var\(--liquid-inner\)/, css],
  ['un seul bouton de fermeture dans le Quiz', !/let html='<button class="btn-luxe quiz-close"/.test(app), true],
  ['icône réelle pour le mode Pro', /<legend><i class="fa-solid fa-scissors"/, index],
  ['aucun emoji utilitaire restant', !/[🌸🐾☠️🌱🌾🤖🧬📖🔍✂️]/u.test(visibleCode), true],
  ['réponse tactile sans ripple décoratif', /:where\(button,\.btn-luxe[\s\S]*?:active\{[\s\S]*?scale\(\.975\)/, css],
];

let failed = false;
for (const [label, rule, source] of checks) {
  const ok = rule === true ? source === true : rule.test(source);
  console.log(`${ok ? '✓' : '✗'} ${label}`);
  if (!ok) failed = true;
}

process.exit(failed ? 1 : 0);
