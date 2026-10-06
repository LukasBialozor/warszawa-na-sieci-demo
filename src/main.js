import * as THREE from 'three';
import { loadCity } from './world/city.js';
import { Environment } from './world/sky.js';
import { Input } from './input.js';
import { ThirdPersonCamera } from './camera.js';
import { Player } from './player/player.js';
import { Avatar, loadHeroModel } from './player/avatar.js';
import { WebLine } from './player/web.js';
import { Hud } from './hud.js';
import { PLACES, project } from './geo.js';
import { interiorPoint } from './world/collision.js';
import { Locator } from './world/location.js';
import { Discovery } from './discovery.js';
import { Traffic } from './world/traffic.js';
import { NIGHT } from './world/night.js';
import { REPO_URL, TOUCH } from './config.js';
import { TouchControls } from './touch.js';

const overlay = document.getElementById('overlay');
if (TOUCH) document.body.classList.add('touch');   // od razu: podczas ladowania bez pomocy klawiszowej
const repoLink = document.getElementById('repo');
if (REPO_URL) repoLink.href = REPO_URL;
for (const a of document.querySelectorAll('#credits a')) a.addEventListener('click', e => e.stopPropagation());
const status = document.getElementById('status');
// blad przy ladowaniu (przerwane pobieranie, brak pliku): komunikat zamiast wiecznego "Ladowanie..."; zostaje pierwszy
let loaded = false;
const loadFailed = e => {
  if (loaded) return;
  loaded = true;
  status.textContent = `Nie udało się wczytać danych${e?.message ? ` (${e.message})` : ''}. Odśwież stronę.`;
};
addEventListener('error', e => loadFailed(e.error));
addEventListener('unhandledrejection', e => loadFailed(e.reason));

let renderer;
try {
  renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
} catch (e) {
  loaded = true;   // zostaje ten komunikat
  status.textContent = 'Ta przeglądarka nie obsługuje WebGL2 - spróbuj aktualnego Chrome, Edge lub Firefox';
  throw e;
}
// Jakosc: "high" albo "low" (mniejsza rozdzielczosc, bez cieni); ?q=low / ?q=high w adresie lub klawisz Q.
// Domyslnie "low" na urzadzeniach dotykowych. Przy dlugotrwale niskim FPS gra sama przechodzi na "low".
const qParam = new URLSearchParams(location.search).get('q');
let quality = qParam === 'low' || qParam === 'high' ? qParam : TOUCH ? 'low' : 'high';
const pixelRatio = () => Math.min(devicePixelRatio, quality === 'high' ? 1.5 : TOUCH ? 1 : 0.85);
function applyQuality() {
  renderer.setPixelRatio(pixelRatio());
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = quality !== 'low';
  scene?.traverse(o => { if (o.material) for (const m of [].concat(o.material)) m.needsUpdate = true; });
}
renderer.setPixelRatio(pixelRatio());
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = quality !== 'low';
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.72;
document.body.prepend(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(68, innerWidth / innerHeight, 0.2, 12000);
addEventListener('resize', () => {
  if (!innerWidth || !innerHeight) return;   // ukryta karta/panel
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  web?.setResolution(innerWidth, innerHeight);
});

const env = new Environment(renderer, scene);
const input = new Input(renderer.domElement);
const hud = new Hud();

const city = await loadCity(import.meta.env.BASE_URL + 'data/city.json', renderer, scene, s => (status.textContent = s))
  .catch(e => { loadFailed(e); throw e; });

env.addReflective(city.materials.glass, 0.45);
env.addReflective(city.materials.water, 1.2);
for (const m of city.reflectiveMaterials) env.addReflective(m, 0.7);

const locator = new Locator(city.data);
const discovery = new Discovery(locator, city.data.towers, hud);
const traffic = new Traffic(scene, city.data, NIGHT, TOUCH ? 0.5 : 1);

// Noca: landmarki podswietlone (PKiN, Kolumna Zygmunta - emisja z koloru i tekstury) oraz emisja zapisana w modelach
// (okna Zlotej 44 i InterContinentalu, napis na dworcu). Jasnosc rosnie z NIGHT (nightGain na materiale).
const floodlit = [];
const FLOODLIT = /^pkin_(wall|tower|plain|clock)|kolumna/;
for (const lm of city.landmarks) {
  lm.root.traverse(o => {
    if (!o.isMesh) return;
    for (const m of [].concat(o.material)) {
      if (floodlit.includes(m)) continue;
      const own = !!m.emissiveMap || m.emissive.getHex() !== 0;
      if (!own && !FLOODLIT.test(m.name)) continue;
      floodlit.push(m);
      if (m.emissiveMap) m.emissive.setRGB(1, 1, 1);
      else if (!own) {
        m.emissive = m.color.clone();
        if (m.map) m.emissiveMap = m.map;
      }
      m.userData.nightGain = /letters/.test(m.name) ? 1.5 : own ? 1.1 : 0.14;
      m.emissiveIntensity = 0;
      m.needsUpdate = true;
    }
  });
}
let whereText = '', whereTimer = 0;

const player = new Player(city);
status.textContent = 'Ładowanie bohatera...';
const avatar = new Avatar(scene, await loadHeroModel().catch(e => { loadFailed(e); throw e; }));
const web = new WebLine(scene);
web.setResolution(innerWidth, innerHeight);
const cam = new ThirdPersonCamera(camera, city);

function teleport(i) {
  const pl = PLACES[i];
  if (pl.mode === 'spot') {
    // punkt podany wprost (x/z albo lat/lon); bez y - na dachu w tym miejscu (takze skosnym)
    const [sx, sz] = pl.lat !== undefined ? project(pl.lat, pl.lon) : [pl.x, pl.z];
    const sy = pl.y ?? city.collision.groundHeight(sx, sz);
    player.teleport(sx, sy + 0.5, sz);
    cam.snap(player);
    cam.yaw = pl.yaw;
    cam.pitch = 0.25;
    currentPlace = pl.name;
    return;
  }
  const [x, z] = project(pl.lat, pl.lon);
  const toCenter = Math.atan2(x, z); // yaw kamery patrzacej na PKiN (poczatek ukladu)
  const angDist = a => Math.abs(Math.atan2(Math.sin(a - toCenter), Math.cos(a - toCenter)));
  if (pl.mode === 'roof') {
    // Najwyzszy dach z widokiem (wolno przed bohaterem i miejsce na kamere za nim). Jesli wysokie dachy sa
    // obudowane (np. taras w koronie Varso), stajemy na najwyzszym, a kamera patrzy z gory ponad scianami.
    const roofs = city.collision.roofsNear(x, z, 60, pl.minArea);
    let spot = null;
    for (const p of roofs) {
      if (p.top < roofs[0].top * 0.7) break;
      const [cx, cz] = interiorPoint(p);
      const top = p.topAt ? p.topAt(cx, cz) : p.top;   // dach skosny: wysokosc w tym punkcie
      const eye = new THREE.Vector3(cx, top + 2.5, cz), cam0 = new THREE.Vector3(cx, top + 2, cz);
      const free = [], back = [];
      for (let a = 0; a < 16; a++) {
        const yaw = a * Math.PI / 8;
        const d = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
        free.push(!city.raycast(eye, d, 30));
        back.push(!city.raycast(cam0, d.negate(), 7));
      }
      const open = [];
      for (let a = 0; a < 16; a++) if (free[a] && back[a]) open.push(a * Math.PI / 8);
      if (free.filter(Boolean).length >= 8 && open.length) { spot = { x: cx, y: top, z: cz, open }; break; }
    }
    if (spot) {
      player.teleport(spot.x, spot.y + 0.5, spot.z);
      cam.yaw = spot.open.reduce((b, a) => (angDist(a) < angDist(b) ? a : b));
      cam.pitch = 0.3;
    } else if (roofs.length) {
      const [cx, cz] = interiorPoint(roofs[0]);
      player.teleport(cx, roofs[0].top + 0.5, cz);
      cam.yaw = toCenter;
      cam.pitch = 1.0;
    } else player.teleport(x, 2, z);
  } else {
    player.teleport(x, city.collision.groundHeight(x, z) + 0.5, z);
  }
  cam.snap(player);
  currentPlace = pl.name;
  hud.message(pl.name);
}

let currentPlace = PLACES[0].name;
teleport(0);

// Start: mysz - pointer lock (gdy przegladarka go odmowi, np. w ramce, tryb "free" z obrotem przy krawedzi);
// dotyk - przyciski na ekranie i pelny ekran.
const touch = new TouchControls(input, {
  onTeleport: i => teleport(i),
  onPause: () => pause(),
});
if (TOUCH) touch.enable();
const playing = () => overlay.classList.contains('hidden');
let started = false;   // po pierwszym starcie pauza zatrzymuje bohatera i ruch uliczny
function pause() {
  overlay.classList.remove('hidden');
  status.textContent = touch.enabled ? 'Dotknij, aby kontynuować' : 'Kliknij, aby kontynuować';
  input.free = false;
  touch.releaseAll();
}
// pointer lock niedostepny (ramka bez zgody, stara przegladarka). Jesli juz kiedys dzialal, to odmowa jest
// chwilowa (Chrome blokuje ponowne przechwycenie tuz po Esc) - wtedy tylko prosimy o ponowne klikniecie.
let lockWorked = false;
function startFree() {
  if (playing()) return;
  if (lockWorked) { status.textContent = 'Kliknij jeszcze raz'; return; }
  input.free = true;
  overlay.classList.add('hidden');
  hud.message('Bez przechwycenia myszy: kursor przy krawędzi obraca kamerę, Esc - pauza', 4);
}
let startPointer = 'mouse';
overlay.addEventListener('pointerdown', e => (startPointer = e.pointerType));
overlay.addEventListener('click', () => {
  if (startPointer === 'touch' || startPointer === 'pen' || touch.enabled) {
    touch.enable();
    overlay.classList.add('hidden');
    touch.showHintOnce();
    document.documentElement.requestFullscreen?.({ navigationUI: 'hide' })
      .then(() => screen.orientation?.lock?.('landscape'))
      .catch(() => {});
    return;
  }
  try {
    const p = renderer.domElement.requestPointerLock();
    if (p?.catch) p.catch(startFree);
  } catch { startFree(); }
});
document.addEventListener('pointerlockerror', startFree);
document.addEventListener('pointerlockchange', () => {
  if (document.pointerLockElement === renderer.domElement) { lockWorked = true; overlay.classList.add('hidden'); }
  else if (!input.free && !touch.enabled) pause();
});
addEventListener('keydown', e => {
  if (e.code === 'Escape' && input.free) pause();
  // start z klawiatury (Enter/Spacja tez daja zgode na pointer lock)
  if (!playing() && !e.repeat && (e.code === 'Enter' || e.code === 'Space') && !e.target.closest?.('a, button')) {
    startPointer = 'mouse';
    overlay.click();
  }
});
// utrata kontekstu WebGL (np. telefon zwolnil pamiec grafiki): three.js odtwarza zasoby, mape otoczenia liczymy od nowa
renderer.domElement.addEventListener('webglcontextlost', () => {
  pause();
  status.textContent = 'Przeglądarka zresetowała grafikę - chwila...';
});
renderer.domElement.addEventListener('webglcontextrestored', () => {
  env.applyTime(true);
  pause();
});
loaded = true;
status.textContent = TOUCH ? 'Dotknij, aby zacząć' : 'Kliknij lub naciśnij Enter, aby zacząć';

const lastGood = new THREE.Vector3();
let slowTime = 0;
function tick(dt, render = true) {
  for (let i = 0; i < PLACES.length; i++) if (input.hit('Digit' + (i + 1))) teleport(i);
  if (input.hit('KeyR')) teleport(PLACES.findIndex(p => p.name === currentPlace));
  if (input.hit('KeyH')) hud.toggleHelp();
  if (input.hit('KeyQ')) { quality = quality === 'low' ? 'high' : 'low'; applyQuality(); hud.message(quality === 'low' ? 'Jakość: niska' : 'Jakość: wysoka', 1.2); }
  if (quality === 'high' && hud.fps > 0 && hud.fps < 26 && playing()) {
    slowTime += dt;
    if (slowTime > 6) { quality = 'low'; applyQuality(); hud.message('Niski FPS - przełączam na niską jakość (Q przywraca)', 3); }
  } else slowTime = 0;
  if (input.hit('KeyT')) { env.clock = (env.clock + 3) % 24; env.applyTime(true); hud.message('Godzina ' + env.timeText(), 1.2); }

  if (!(dt > 0)) dt = 1 / 60;
  started ||= playing();
  const frozen = started && !playing();   // pauza: bohater, lina i ruch uliczny stoja, kamera i niebo dalej
  input.edge(dt);
  // dotyk: kamera sama obraca sie za kierunkiem ruchu, gdy kciuk nie rusza kamera (nie przy biegu "do kamery")
  if (!frozen && touch.enabled && !touch.looking && player.state !== 'wall') {
    const vx = player.vel.x, vz = player.vel.z, sp = Math.hypot(vx, vz);
    if (sp > 3) {
      let d = Math.atan2(-vx, -vz) - cam.yaw;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      if (Math.abs(d) < 2.3) cam.yaw += d * (1 - Math.exp(-dt * 1.4 * Math.min(1, sp / 12)));
    }
  }
  if (!frozen) {
    player.update(dt, input, cam);
    // zabezpieczenie: blad numeryczny (np. zdegenerowana krawedz kolizji) nie moze "zgubic" gracza
    if (!Number.isFinite(player.pos.x + player.pos.y + player.pos.z + player.vel.x + player.vel.y + player.vel.z)) {
      player.pos.copy(lastGood);
      player.vel.set(0, 0, 0);
      player.state = 'air';
    } else lastGood.copy(player.pos);
    for (const e of player.events) {
      if (e === 'web') web.shoot();
      if (e === 'nowebtarget') hud.message('Brak budynku do zaczepienia sieci', 1);
    }
    avatar.update(dt, player);
    web.update(dt, player.state === 'swing' || player.state === 'zip', avatar.handPos, player.webPoint);
  }
  cam.update(dt, player, input);
  avatar.root.visible = !cam.tooClose;
  env.update(dt, player.pos);
  city.update(camera, dt);
  city.trees.update(camera, dt);
  whereTimer -= dt;
  if (whereTimer <= 0) {
    whereTimer = 0.3;
    whereText = locator.describe(player.pos.x, player.pos.z);
  }
  if (!frozen) {
    discovery.update(dt, player.pos);
    traffic.update(dt, player.pos);
  }
  city.furniture.update(camera, dt);
  city.materials.road.emissive.setRGB(0.55, 0.42, 0.3).multiplyScalar(NIGHT.value * 0.32);
  for (const m of floodlit) m.emissiveIntensity = NIGHT.value * m.userData.nightGain;
  hud.update(dt, player, whereText, env.timeText());

  if (render) renderer.render(scene, camera);
  input.endFrame();
}

const timer = new THREE.Timer();
timer.connect(document);
function frame(now) {
  requestAnimationFrame(frame);   // najpierw: wyjatek w jednej klatce nie zatrzymuje gry
  timer.update(now);
  tick(Math.min(timer.getDelta(), 1 / 30));
}
requestAnimationFrame(frame);

// Dostep z konsoli / do testow automatycznych.
// game.run(sekundy, {klawisze}) - symulacja bez petli rAF (np. gdy karta jest w tle)
window.game = {
  THREE, scene, camera, renderer, city, player, avatar, web, cam, input, env, hud, locator, teleport, tick,
  run(seconds, keys = [], dt = 1 / 60) {
    for (const k of keys) input.press(k);
    for (let t = 0; t < seconds; t += dt) tick(dt, false);
    for (const k of keys) input.release(k);
    tick(dt);
    return { pos: player.pos.toArray().map(v => +v.toFixed(1)), vel: +player.vel.length().toFixed(1), state: player.state };
  },
  // Podglad z dowolnej kamery (testy w panelu bez petli rAF): renderuje i kopiuje obraz na nakladke; unsnap() ja chowa
  snap(pos, look, fov = 60) {
    camera.fov = fov;
    camera.updateProjectionMatrix();
    camera.position.set(...pos);
    camera.lookAt(...look);
    camera.updateMatrixWorld();
    env.update(0, new THREE.Vector3(look[0], 0, look[2]));
    city.trees.update(camera);
    city.furniture.update(camera);
    renderer.render(scene, camera);
    let c = document.getElementById('snap');
    if (!c) {
      c = document.createElement('canvas');
      c.id = 'snap';
      c.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;z-index:99';
      document.body.appendChild(c);
    }
    c.style.display = 'block';
    c.width = renderer.domElement.width;
    c.height = renderer.domElement.height;
    c.getContext('2d').drawImage(renderer.domElement, 0, 0);
    document.getElementById('overlay')?.remove();
  },
  unsnap() {
    const c = document.getElementById('snap');
    if (c) c.style.display = 'none';
  },
};
