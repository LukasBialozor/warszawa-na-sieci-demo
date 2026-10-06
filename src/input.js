// Klawiatura + mysz. Przyciski myszy traktujemy jak klawisze: 'Mouse0' (lewy), 'Mouse2' (prawy).
// moveX/moveY: analogowy ruch (drazek dotykowy), dodawany do klawiszy WASD.
// Tryb "free" (przegladarka nie dala pointer lock, np. strona w ramce): kamera idzie za kursorem,
// a kursor przy krawedzi ekranu obraca ja dalej (edge()).
const EDGE = 0.1;          // szerokosc pasa przy krawedzi (ulamek ekranu)
const EDGE_SPEED = 1100;   // [px/s] rownowaznik ruchu myszy przy samej krawedzi

export class Input {
  constructor(dom) {
    this.dom = dom;
    this.keys = new Set();
    this.pressed = new Set();
    this.released = new Set();
    this.dx = 0;
    this.dy = 0;
    this.moveX = 0;
    this.moveY = 0;
    this.locked = false;
    this.dragging = false;
    this.free = false;
    this.cursor = null;

    addEventListener('keydown', e => {
      if (e.repeat) return;
      // Tab tylko w grze (na ekranie startowym przechodzi po linkach)
      if (['Space', 'ArrowUp', 'ArrowDown'].includes(e.code) || (e.code === 'Tab' && (this.locked || this.free))) e.preventDefault();
      this.press(e.code);
    });
    addEventListener('keyup', e => this.release(e.code));
    dom.addEventListener('mousedown', e => {
      if (!this.locked && !this.free && e.button === 0) this.dragging = true;
      if (this.locked || this.free) this.press('Mouse' + e.button);
    });
    addEventListener('mouseup', e => {
      if (e.button === 0) this.dragging = false;
      this.release('Mouse' + e.button);
    });
    addEventListener('mousemove', e => {
      if (this.locked || this.dragging || this.free) {
        this.dx += e.movementX;
        this.dy += e.movementY;
      }
      this.cursor = [e.clientX / innerWidth, e.clientY / innerHeight];
    });
    document.documentElement.addEventListener('mouseleave', () => (this.cursor = null));
    dom.addEventListener('contextmenu', e => e.preventDefault());
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === dom;
    });
    addEventListener('blur', () => {
      for (const k of this.keys) this.released.add(k);
      this.keys.clear();
    });
  }

  press(code) {
    if (!this.keys.has(code)) this.pressed.add(code);
    this.keys.add(code);
  }

  release(code) {
    if (this.keys.has(code)) this.released.add(code);
    this.keys.delete(code);
  }

  edge(dt) {
    if (!this.free || !this.cursor) return;
    const push = v => (v < EDGE ? (v - EDGE) / EDGE : v > 1 - EDGE ? (v - 1 + EDGE) / EDGE : 0);
    this.dx += push(this.cursor[0]) * EDGE_SPEED * dt;
    this.dy += push(this.cursor[1]) * EDGE_SPEED * 0.5 * dt;
  }

  down(...codes) { return codes.some(c => this.keys.has(c)); }
  hit(...codes) { return codes.some(c => this.pressed.has(c)); }
  up(...codes) { return codes.some(c => this.released.has(c)); }

  endFrame() {
    this.pressed.clear();
    this.released.clear();
    this.dx = this.dy = 0;
  }
}

// Mapowanie akcji
export const KEYS = {
  forward: ['KeyW', 'ArrowUp'],
  back: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  jump: ['Space'],
  sprint: ['ShiftLeft', 'ShiftRight'],
  swing: ['Mouse0', 'KeyF'],
  zip: ['Mouse2', 'KeyE'],
  dive: ['KeyC', 'ControlLeft'],
};
