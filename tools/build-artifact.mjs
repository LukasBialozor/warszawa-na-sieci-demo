// Wersja gry dla hostingu, ktory serwuje tylko tekst i obrazy (artefakty claude.ai): -> dist-artifact/
//  - build Vite z VITE_BINARY_AS_TEXT=1 (gra czyta pliki binarne jako base64, patrz src/binary.js),
//  - lod2.bin i modele .glb zamienione na <nazwa>.txt (base64),
//  - artifact.html: tresc strony bez <!doctype>/<html>/<head>/<body> (szkielet dokleja hosting), skrypt na koncu.
// Na koncu wypisuje liste plikow do opublikowania obok strony.
import fs from 'node:fs';
import path from 'node:path';
import { build } from 'vite';

const OUT = 'dist-artifact';
process.env.VITE_BINARY_AS_TEXT = '1';
await build({ build: { outDir: OUT, emptyOutDir: true }, logLevel: 'warn' });

const files = [];
const walk = dir => {
  for (const f of fs.readdirSync(path.join(OUT, dir))) {
    const rel = dir ? `${dir}/${f}` : f;
    if (fs.statSync(path.join(OUT, rel)).isDirectory()) { walk(rel); continue; }
    if (/\.(bin|glb)$/.test(rel)) {
      fs.writeFileSync(path.join(OUT, rel + '.txt'), fs.readFileSync(path.join(OUT, rel)).toString('base64'));
      fs.unlinkSync(path.join(OUT, rel));
      files.push(rel + '.txt');
    } else if (rel !== 'index.html') files.push(rel);
  }
};
walk('');

const html = fs.readFileSync(path.join(OUT, 'index.html'), 'utf8');
const title = html.match(/<title>[\s\S]*?<\/title>/)[0];
const style = html.match(/<style>[\s\S]*?<\/style>/)[0];
const scripts = [...html.matchAll(/<script type="module"[^>]*><\/script>/g)].map(m => m[0].replace(' crossorigin', ''));
const body = html.match(/<body>([\s\S]*?)<\/body>/)[1].replace(/<script type="module"[^>]*><\/script>/g, '').trim();
fs.writeFileSync(path.join(OUT, 'artifact.html'), [title, style, body, ...scripts].join('\n') + '\n');

const size = files.reduce((s, f) => s + fs.statSync(path.join(OUT, f)).size, 0);
console.log(`${OUT}/artifact.html + ${files.length} plikow (${(size / 1e6).toFixed(1)} MB):`);
for (const f of files) console.log('  ' + f);
