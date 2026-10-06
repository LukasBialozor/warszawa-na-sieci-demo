// Publikacja strony na GitHub Pages: buduje dist/ i wypycha go jako jedyny commit galezi gh-pages
// repozytorium z podanego remote (domyslnie `public`). GitHub: Settings -> Pages -> Deploy from a branch -> gh-pages, / (root).
// Uzycie: npm run deploy:pages [-- <remote> [opis commita]]
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

const [remote = 'public', message = 'Publikacja strony'] = process.argv.slice(2);
const url = execFileSync('git', ['remote', 'get-url', remote], { encoding: 'utf8' }).trim();
execFileSync('npm', ['run', 'build'], { stdio: 'inherit', shell: true });
fs.writeFileSync('dist/.nojekyll', '');   // pliki serwowane wprost, bez Jekylla
fs.rmSync('dist/.git', { recursive: true, force: true });
const git = (...args) => execFileSync('git', args, { cwd: 'dist', stdio: 'inherit' });
git('init', '-q', '-b', 'gh-pages');
git('add', '-A');
git('commit', '-q', '-m', message);
git('push', '-q', '-f', url, 'gh-pages');
fs.rmSync('dist/.git', { recursive: true, force: true });
console.log(`gh-pages -> ${url}`);
