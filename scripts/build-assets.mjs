#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { transform } from 'esbuild';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'dist');
const JS = [
  'js/app.js',
  'js/extensions-v7.js',
  'js/extensions-v8.js',
  'js/extensions-v9.js',
  'js/extensions-v10.js',
];

fs.mkdirSync(OUT, { recursive: true });

const jsSource = JS.map(file => fs.readFileSync(path.join(ROOT, file), 'utf8')).join('\n;\n');
const js = await transform(jsSource, {
  loader: 'js',
  minify: true,
  target: ['es2018'],
  legalComments: 'none',
  charset: 'utf8',
});
fs.writeFileSync(path.join(OUT, 'app.min.js'), js.code);

for (const [source, target] of [
  ['css/styles.css', 'styles.min.css'],
  ['css/icons.css', 'icons.min.css'],
]) {
  const result = await transform(fs.readFileSync(path.join(ROOT, source), 'utf8'), {
    loader: 'css',
    minify: true,
    legalComments: 'none',
    charset: 'utf8',
  });
  fs.writeFileSync(path.join(OUT, target), result.code);
}

const sizes = ['app.min.js', 'styles.min.css', 'icons.min.css'].map(file => ({
  file,
  bytes: fs.statSync(path.join(OUT, file)).size,
}));
console.log('Assets de production générés :');
sizes.forEach(item => console.log(`  ${item.file}: ${Math.round(item.bytes / 1024)} Ko`));
