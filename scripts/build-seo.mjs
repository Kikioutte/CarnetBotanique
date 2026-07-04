#!/usr/bin/env node
/**
 * Génère le contenu SEO statique à partir de plants.json :
 *   - especes.html : les fiches en HTML pur, lisibles sans JavaScript et indexables
 *     par les moteurs (l'app principale est rendue en JS, invisible aux crawlers).
 *     Chaque fiche pointe vers l'app via index.html#plante=<id>.
 *   - sitemap.xml : index + page espèces.
 *
 * Usage :  node scripts/build-seo.mjs [URL_PUBLIQUE]
 *          node scripts/build-seo.mjs https://mon-domaine.fr/
 * À relancer après toute modification de plants.json.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SITE = (process.argv[2] || 'https://kikioutte.github.io/CarnetBotanique/').replace(/\/?$/, '/');
const plants = JSON.parse(readFileSync(join(ROOT, 'plants.json'), 'utf8'));

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const byFam = new Map();
for (const p of plants) {
  const f = p.famille || 'Autres';
  if (!byFam.has(f)) byFam.set(f, []);
  byFam.get(f).push(p);
}
const fams = [...byFam.keys()].sort((a, b) => a.localeCompare(b, 'fr'));

const rows = fams.map(f => {
  const items = byFam.get(f).sort((a, b) => a.nomFr.localeCompare(b.nomFr, 'fr')).map(p => `
    <article id="${esc(p.id)}">
      <h3><a href="index.html#plante=${encodeURIComponent(p.id)}">${esc(p.nomFr)}</a></h3>
      <p class="lat"><i>${esc(p.nomLat)}</i>${p.type ? ' · ' + esc(p.type) : ''}${p.region ? ' · ' + esc(p.region) : ''}</p>
      ${p.besoins ? `<p>${esc(String(p.besoins).slice(0, 280))}</p>` : ''}
    </article>`).join('');
  return `<section><h2>${esc(f)}</h2>${items}</section>`;
}).join('\n');

const html = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Index des ${plants.length} espèces — L'Herbier de Vie</title>
<meta name="description" content="Index complet des ${plants.length} espèces du carnet de botanique L'Herbier de Vie : noms français et latins, familles, origines et conseils de conservation.">
<link rel="canonical" href="${SITE}especes.html">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ctext y='.9em' font-size='90'%3E%F0%9F%8C%BF%3C/text%3E%3C/svg%3E">
<style>
body{font-family:Georgia,serif;max-width:860px;margin:0 auto;padding:24px 18px;background:#FAF7F2;color:#1F2D24;line-height:1.6}
h1{font-weight:500}h2{border-bottom:1px solid #C2A26A;padding-bottom:4px;margin-top:36px;color:#7D8E74}
h3{margin:18px 0 2px}h3 a{color:#1F2D24;text-decoration:none}h3 a:hover{color:#C36A4B}
.lat{color:#7D8E74;margin:0 0 4px;font-size:.9em}p{margin:4px 0}
header a{color:#C36A4B}footer{margin-top:48px;font-size:.85em;color:#7D8E74}
</style>
</head>
<body>
<header>
  <h1>L'Herbier de Vie — Index des ${plants.length} espèces</h1>
  <p>Version texte de l'herbier, pensée pour la consultation rapide et les moteurs de recherche.
     Pour l'expérience complète (photos, quiz, flashcards, calendrier de floraison) :
     <a href="index.html">ouvrir le carnet interactif</a>.</p>
</header>
${rows}
<footer>Généré depuis plants.json · <a href="index.html">L'Herbier de Vie</a></footer>
</body>
</html>
`;
writeFileSync(join(ROOT, 'especes.html'), html);

// Sortie volontairement déterministe (pas de date de génération) : la CI vérifie que
// les fichiers committés correspondent exactement à une régénération depuis plants.json.
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${SITE}</loc><changefreq>weekly</changefreq></url>
  <url><loc>${SITE}especes.html</loc><changefreq>weekly</changefreq></url>
</urlset>
`;
writeFileSync(join(ROOT, 'sitemap.xml'), sitemap);
writeFileSync(join(ROOT, 'robots.txt'), `User-agent: *\nAllow: /\nSitemap: ${SITE}sitemap.xml\n`);

console.log(`especes.html (${plants.length} espèces), sitemap.xml et robots.txt générés pour ${SITE}`);
