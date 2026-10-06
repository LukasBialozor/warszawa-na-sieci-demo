// Sterowanie dotykowe (telefony, tablety). Lewy kciuk: plywajacy drazek ruchu (wychylenie do konca = sprint),
// reszta ekranu: rozgladanie przeciaganiem (z przyspieszeniem przy szybkim ruchu). Przyciski udaja klawisze
// (Input.press/release), wiec fizyka gracza nie odroznia dotyku od klawiatury. Trzymana SIEC tez obraca kamere.
// Gdy kciuk nie rusza kamera, main.js obraca ja sama za kierunkiem ruchu (looking = false).
import { PLACES } from './geo.js';

const STICK_R = 56;       // [px] pelne wychylenie drazka
const SPRINT_AT = 0.85;   // wychylenie, od ktorego drazek wlacza sprint (i bieg po scianie)
const LOOK_GAIN = 4.2;    // palec przesuwa sie mniej niz mysz
const LOOK_BOOST = 30;    // [px na zdarzenie] przy szybkim przeciaganiu czulosc rosnie (do 1.8x)

export class TouchControls {
  constructor(input, { onTeleport, onPause }) {
    this.input = input;
    this.onTeleport = onTeleport;
    this.onPause = onPause;
    this.el = document.getElementById('touch');
    this.stickEl = document.getElementById('stick');
    this.knobEl = document.getElementById('knob');
    this.placesEl = document.getElementById('t-places');
    this.enabled = false;
    this.stick = null;            // { id, x0, y0 }
    this.pointers = new Map();    // pointerId -> { x, y, key?, look }
    this.lastLook = -1e9;

    for (const [i, p] of PLACES.entries()) {
      const b = document.createElement('button');
      b.textContent = `${i + 1}. ${p.name}`;
      b.addEventListener('click', () => { this.placesEl.classList.add('hidden'); this.onTeleport(i); });
      this.placesEl.appendChild(b);
    }
    document.getElementById('t-map').addEventListener('click', () => this.placesEl.classList.toggle('hidden'));
    document.getElementById('t-time').addEventListener('click', () => this.tap('KeyT'));
    document.getElementById('t-pause').addEventListener('click', () => this.onPause());
    this.hintEl = document.getElementById('t-hint');
    document.getElementById('t-help').addEventListener('click', () => this.hintEl.classList.remove('hidden'));
    document.getElementById('t-hint-ok').addEventListener('click', () => {
      this.hintEl.classList.add('hidden');
      try { localStorage.setItem('touchHint', '1'); } catch { /* bez pamieci przegladarki */ }
    });

    const layer = document.getElementById('t-layer');
    layer.addEventListener('pointerdown', e => this.down(e));
    layer.addEventListener('pointermove', e => this.move(e));
    layer.addEventListener('pointerup', e => this.up(e));
    layer.addEventListener('pointercancel', e => this.up(e));
    for (const b of this.el.querySelectorAll('.tb')) {
      b.addEventListener('pointerdown', e => this.down(e, b));
      b.addEventListener('pointermove', e => this.move(e));
      b.addEventListener('pointerup', e => this.up(e));
      b.addEventListener('pointercancel', e => this.up(e));
    }
    this.el.addEventListener('contextmenu', e => e.preventDefault());
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.releaseAll(); });
  }

  enable() {
    this.enabled = true;
    document.body.classList.add('touch');
  }

  // pierwsze uruchomienie: krotka podpowiedz, co robia przyciski
  showHintOnce() {
    let seen = false;
    try { seen = localStorage.getItem('touchHint') === '1'; } catch { /* brak dostepu */ }
    if (!seen) this.hintEl.classList.remove('hidden');
  }

  // czy kciuk niedawno obracal kamere (wtedy kamera nie obraca sie sama)
  get looking() {
    return performance.now() - this.lastLook < 900;
  }

  // krotkie "nacisniecie" klawisza (hit w najblizszej klatce)
  tap(code) {
    this.input.press(code);
    setTimeout(() => this.input.release(code), 80);
  }

  down(e, button = null) {
    if (e.pointerType === 'mouse' && !button) return;
    e.preventDefault();
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* wskaznik juz nieaktywny */ }
    const p = { x: e.clientX, y: e.clientY, key: null, look: false };
    if (button) {
      p.key = button.dataset.key;
      p.look = button.hasAttribute('data-look');
      this.input.press(p.key);
      button.classList.add('on');
      p.button = button;
    } else if (!this.stick && e.clientX < innerWidth * 0.45) {
      this.stick = { id: e.pointerId, x0: e.clientX, y0: e.clientY };
      this.stickEl.classList.add('on');
      this.stickEl.style.left = e.clientX + 'px';
      this.stickEl.style.top = e.clientY + 'px';
      this.knob(0, 0);
    } else p.look = true;
    this.pointers.set(e.pointerId, p);
  }

  move(e) {
    const p = this.pointers.get(e.pointerId);
    if (!p) return;
    e.preventDefault();
    if (this.stick && this.stick.id === e.pointerId) {
      let dx = e.clientX - this.stick.x0, dy = e.clientY - this.stick.y0;
      const d = Math.hypot(dx, dy);
      if (d > STICK_R) { dx *= STICK_R / d; dy *= STICK_R / d; }
      this.input.moveX = dx / STICK_R;
      this.input.moveY = -dy / STICK_R;
      this.knob(dx, dy);
      const sprint = d / STICK_R >= SPRINT_AT;
      if (sprint) this.input.press('ShiftLeft'); else this.input.release('ShiftLeft');
      this.stickEl.classList.toggle('sprint', sprint);
    } else if (p.look) {
      const dx = e.clientX - p.x, dy = e.clientY - p.y;
      const gain = LOOK_GAIN * (1 + Math.min(0.8, Math.hypot(dx, dy) / LOOK_BOOST));
      this.input.dx += dx * gain;
      this.input.dy += dy * gain;
      this.lastLook = performance.now();
    }
    p.x = e.clientX;
    p.y = e.clientY;
  }

  up(e) {
    const p = this.pointers.get(e.pointerId);
    if (!p) return;
    this.pointers.delete(e.pointerId);
    if (p.key) {
      this.input.release(p.key);
      p.button.classList.remove('on');
    }
    if (this.stick && this.stick.id === e.pointerId) this.endStick();
  }

  endStick() {
    this.stick = null;
    this.input.moveX = this.input.moveY = 0;
    this.input.release('ShiftLeft');
    this.stickEl.classList.remove('on', 'sprint');
    this.stickEl.style.left = this.stickEl.style.top = '';
    this.knob(0, 0);
  }

  knob(dx, dy) {
    this.knobEl.style.transform = `translate(${dx}px, ${dy}px)`;
  }

  releaseAll() {
    for (const p of this.pointers.values()) if (p.key) { this.input.release(p.key); p.button.classList.remove('on'); }
    this.pointers.clear();
    if (this.stick) this.endStick();
  }
}
