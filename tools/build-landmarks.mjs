// Buduje modele landmarkow skryptami Blendera (tryb wsadowy) -> public/models/*.glb + *.json
// Sciezka do Blendera: zmienna BLENDER albo domyslna instalacja Blendera 5.2 na Windows.
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';

const BLENDER = process.env.BLENDER || 'C:/Program Files/Blender Foundation/Blender 5.2/blender.exe';
const SCRIPTS = ['pkin', 'centralna', 'zlote_tarasy', 'zlota44', 'intercontinental', 'iglice', 'most', 'hero'];

if (!existsSync(BLENDER) && !process.env.BLENDER) {
  console.error(`Nie znaleziono Blendera (${BLENDER}). Ustaw zmienna BLENDER na sciezke do blender(.exe).`);
  process.exit(1);
}
for (const name of process.argv.slice(2).length ? process.argv.slice(2) : SCRIPTS) {
  console.log(`== ${name}`);
  const out = execFileSync(BLENDER, ['-b', '--factory-startup', '-P', `blender/${name}.py`], { encoding: 'utf8', maxBuffer: 1 << 26 });
  const line = out.split('\n').find(l => /LANDMARK_OK|HERO_OK|Traceback|Error/.test(l));
  console.log(line ? line.trim() : 'brak potwierdzenia - sprawdz wyjscie Blendera');
}
