// Nakladka HUD: predkosc, wysokosc, stan, FPS, komunikaty, pomoc.
const STATE_PL = { ground: 'bieg', air: 'lot', swing: 'bujanie', wall: 'ściana', zip: 'przyciąganie' };

export class Hud {
  constructor() {
    this.el = document.getElementById('hud');
    this.stats = document.getElementById('stats');
    this.toast = document.getElementById('toast');
    this.help = document.getElementById('help');
    this.frames = 0;
    this.acc = 0;
    this.fps = 0;
    this.toastTime = 0;
    this.bannerEl = document.getElementById('banner');
    this.towerEl = document.getElementById('tower');
    this.bannerTime = 0;
  }

  // duza tablica (nowa dzielnica, landmark)
  banner(title, sub = '') {
    this.bannerEl.innerHTML = `<div class="t"></div><div class="s"></div>`;
    this.bannerEl.firstChild.textContent = title;
    this.bannerEl.lastChild.textContent = sub;
    this.bannerEl.classList.remove('show');
    void this.bannerEl.offsetWidth;   // restart animacji
    this.bannerEl.classList.add('show');
    this.bannerTime = 4;
  }

  // podpis wiezowca, na ktorym jest gracz (pusty = schowaj)
  label(text) {
    this.towerEl.textContent = text;
    this.towerEl.classList.toggle('show', !!text);
  }

  message(text, secs = 1.6) {
    this.toast.textContent = text;
    this.toast.classList.add('show');
    this.toastTime = secs;
  }

  toggleHelp() { this.help.classList.toggle('hidden'); }

  update(dt, player, place, time = '') {
    this.frames++;
    this.acc += dt;
    if (this.acc >= 0.5) {
      this.fps = Math.round(this.frames / this.acc);
      this.frames = 0;
      this.acc = 0;
    }
    if (this.bannerTime > 0) {
      this.bannerTime -= dt;
      if (this.bannerTime <= 0) this.bannerEl.classList.remove('show');
    }
    if (this.toastTime > 0) {
      this.toastTime -= dt;
      if (this.toastTime <= 0) this.toast.classList.remove('show');
    }
    // tekst co 0.1 s - przebudowa DOM co klatke kosztuje (zwlaszcza na telefonach)
    this.statsTime = (this.statsTime || 0) - dt;
    if (this.statsTime > 0) return;
    this.statsTime = 0.1;
    const kmh = Math.round(player.vel.length() * 3.6);
    this.stats.innerHTML =
      `<b>${kmh}</b> km/h &nbsp; <b>${Math.round(player.pos.y)}</b> m &nbsp; ${STATE_PL[player.state] || player.state}` +
      ` &nbsp; <span class="dim">${time}</span>` +
      `<br><span class="dim">${place} · ${this.fps} FPS</span>`;
  }
}
