// Proceduralne tekstury (canvas): style fasad (tablica tekstur), szklo, szum, asfalt.
import * as THREE from 'three';

function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

function makeTexture(canvas, renderer) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return tex;
}

// ---------------------------------------------------------------- fasady
// Kafel fasady: 4 przesla (po 3.6 m) x 4 pietra (po 3.3 m), 512 x 512 px. Dolny rzad (v = 0) to PARTER - shader
// (city.js) uzywa go tylko dla najnizszej kondygnacji, wyzsze pietra cyklicznie biora rzedy 1-3.
// Jasne tla, bo kolor budynku (OSM building:colour lub paleta) mnozy teksture. Indeks stylu = atrybut "style".
export const FACADE_CELLS = 4;
export const FACADE_STYLES = ['kamienica', 'blok', 'biurowiec', 'socrealizm', 'stare_miasto', 'przemysl', 'nowy', 'dawny'];

const S = 512, CELL = 128;
const PX_M = CELL / 3.6, PY_M = CELL / 3.3;   // px na metr w poziomie / pionie

function base(g, r, col, noise = 22, n = 5000) {
  g.fillStyle = col;
  g.fillRect(0, 0, S, S);
  for (let i = 0; i < n; i++) {
    const v = r() * noise - noise / 2;
    g.fillStyle = v > 0 ? `rgba(255,255,255,${v / 100})` : `rgba(0,0,0,${-v / 100})`;
    g.fillRect(r() * S, r() * S, 2 + r() * 3, 2 + r() * 2);
  }
}

// gorna krawedz (px, canvas) komorki pietra; rzad 0 = parter na dole kafla
const rowTop = row => S - (row + 1) * CELL;

// Maska szyb (kanal alfa tekstury: 255 = szyba): ten sam malarz rysuje drugi raz na kontekscie, ktory zamienia
// kolory na czern z ta sama przezroczystoscia, a wszystko w glass() na biel. Shader zapala noca tylko szyby.
let inGlass = false;
const alphaOf = s => (typeof s === 'string' && /^(rgba|hsla)\(/.test(s) ? parseFloat(s.slice(s.lastIndexOf(',') + 1)) : 1);
function maskContext(g) {
  return new Proxy(g, {
    get(t, k) { const v = t[k]; return typeof v === 'function' ? v.bind(t) : v; },
    set(t, k, v) {
      if (k === 'fillStyle') t.fillStyle = inGlass ? '#fff' : `rgba(0,0,0,${alphaOf(v)})`;
      else t[k] = v;
      return true;
    },
  });
}

function glass(g, r, x, y, w, h, tint = [52, 62, 74]) {
  inGlass = true;
  const k = r();
  const lift = k > 0.82 ? 40 : k < 0.15 ? -12 : 0;   // swiatlo / zaslony / ciemne wnetrze
  const grad = g.createLinearGradient(x, y, x + w * 0.4, y + h);
  grad.addColorStop(0, `rgb(${tint[0] + 58 + lift},${tint[1] + 62 + lift},${tint[2] + 66 + lift})`);
  grad.addColorStop(0.45, `rgb(${tint[0] + 12 + lift},${tint[1] + 14 + lift},${tint[2] + 16 + lift})`);
  grad.addColorStop(1, `rgb(${tint[0] + lift},${tint[1] + lift},${tint[2] + lift})`);
  g.fillStyle = grad;
  g.fillRect(x, y, w, h);
  if (k > 0.6 && k < 0.8) {   // firanka / roleta w gornej czesci
    g.fillStyle = 'rgba(232,226,210,0.55)';
    g.fillRect(x, y, w, h * (0.2 + r() * 0.35));
  }
  inGlass = false;
}

function frame(g, x, y, w, h, t, col) {
  g.fillStyle = col;
  g.fillRect(x - t, y - t, w + 2 * t, t);
  g.fillRect(x - t, y + h, w + 2 * t, t);
  g.fillRect(x - t, y, t, h);
  g.fillRect(x + w, y, t, h);
}

// okno z rama, szczeblinami (cols x rows kwater) i parapetem
function win(g, r, cx, y, w, h, o = {}) {
  const x = cx - w / 2;
  if (o.reveal) {   // glebokie oscieze
    g.fillStyle = o.reveal;
    g.fillRect(x - 5, y - 5, w + 10, h + 10);
  }
  glass(g, r, x, y, w, h, o.tint);
  const fc = o.frame || '#f3f1ec', ft = o.ft ?? 3;
  frame(g, x, y, w, h, ft, fc);
  g.fillStyle = fc;
  const cols = o.cols ?? 2, rows = o.rows ?? 2, bar = o.bar ?? 3;
  for (let i = 1; i < cols; i++) g.fillRect(x + (w * i) / cols - bar / 2, y, bar, h);
  if (rows === 2) g.fillRect(x, y + h * (o.transom ?? 0.32) - bar / 2, w, bar);
  else for (let j = 1; j < rows; j++) g.fillRect(x, y + (h * j) / rows - bar / 2, w, bar);
  if (o.sill !== false) {
    g.fillStyle = 'rgba(0,0,0,0.22)';
    g.fillRect(x - 7, y + h + ft, w + 14, 5);
    g.fillStyle = 'rgba(255,255,255,0.35)';
    g.fillRect(x - 7, y + h + ft, w + 14, 2);
  }
}

function hline(g, y, h, col) {
  g.fillStyle = col;
  g.fillRect(0, y, S, h);
}

function shopfront(g, r, bay, o = {}) {
  const y0 = rowTop(0), x0 = bay * CELL;
  const top = y0 + (o.top ?? 18), bottom = S - (o.base ?? 8);
  g.fillStyle = o.frame || '#3a3d40';
  g.fillRect(x0 + 8, top - 4, CELL - 16, bottom - top + 4);
  glass(g, r, x0 + 12, top, CELL - 24, bottom - top - 4, [40, 48, 56]);
  g.fillStyle = o.frame || '#3a3d40';
  g.fillRect(x0 + CELL / 2 - 2, top, 4, bottom - top);
  if (o.sign !== false && r() > 0.35) {   // szyld
    g.fillStyle = `hsl(${Math.floor(r() * 360)},${30 + r() * 40}%,${35 + r() * 25}%)`;
    g.fillRect(x0 + 14, top - 16, CELL - 28, 10);
  }
}

function door(g, bay, col = '#4a3a2e', arch = false) {
  const x0 = bay * CELL + CELL / 2 - 26, y0 = rowTop(0) + 30;
  g.fillStyle = 'rgba(0,0,0,0.3)';
  g.fillRect(x0 - 5, y0 - 5, 62, S - y0 + 5);
  g.fillStyle = col;
  g.fillRect(x0, y0, 52, S - y0);
  if (arch) {
    g.beginPath();
    g.arc(x0 + 26, y0, 26, Math.PI, 0);
    g.fill();
  }
  g.fillStyle = 'rgba(255,255,255,0.15)';
  g.fillRect(x0 + 25, y0, 2, S - y0);
}

const PAINTERS = {
  // kamienica przedwojenna: wysokie okna z opaskami, gzymsiki i naczolki, pasy miedzy pietrami, boniowany parter
  kamienica(g, r) {
    base(g, r, '#f1ebe0');
    for (let row = 1; row < 4; row++) {
      const y0 = rowTop(row);
      hline(g, y0 + CELL - 7, 5, 'rgba(0,0,0,0.10)');
      hline(g, y0 + CELL - 9, 2, 'rgba(255,255,255,0.35)');
      for (let b = 0; b < 4; b++) {
        const cx = b * CELL + CELL / 2, w = 1.25 * PX_M, h = 2.15 * PY_M, y = y0 + 22;
        g.fillStyle = 'rgba(255,255,255,0.45)';
        g.fillRect(cx - w / 2 - 8, y - 8, w + 16, h + 12);
        win(g, r, cx, y, w, h, { frame: '#f6f3ee', cols: 2, rows: 2, transom: 0.3 });
        g.fillStyle = 'rgba(0,0,0,0.16)';
        g.fillRect(cx - w / 2 - 12, y - 16, w + 24, 6);
        g.fillStyle = 'rgba(255,255,255,0.5)';
        g.fillRect(cx - w / 2 - 12, y - 18, w + 24, 3);
        if (row === 1) {
          g.fillStyle = 'rgba(0,0,0,0.12)';
          g.beginPath();
          g.moveTo(cx - w / 2 - 12, y - 18);
          g.lineTo(cx, y - 32);
          g.lineTo(cx + w / 2 + 12, y - 18);
          g.fill();
        }
      }
    }
    const y0 = rowTop(0);
    for (let yy = y0; yy < S; yy += 13) hline(g, yy, 2, 'rgba(0,0,0,0.09)');
    hline(g, y0, 8, 'rgba(0,0,0,0.12)');
    for (let b = 0; b < 4; b++) {
      if (b === 2) door(g, b, '#5a4231', true);
      else shopfront(g, r, b, { frame: '#2f3338' });
    }
  },

  // blok z wielkiej plyty: szwy paneli, szerokie okna, loggie z kolorowymi balustradami
  blok(g, r) {
    base(g, r, '#e9e7e2', 16);
    for (let row = 0; row < 4; row++) {
      const y0 = rowTop(row);
      hline(g, y0 + CELL - 3, 3, 'rgba(0,0,0,0.16)');
      for (let b = 0; b < 4; b++) {
        const x0 = b * CELL;
        g.fillStyle = 'rgba(0,0,0,0.13)';
        g.fillRect(x0, y0, 3, CELL);
        if (row > 0 && (b === 1 || b === 3)) {
          g.fillStyle = 'rgba(40,40,45,0.55)';
          g.fillRect(x0 + 10, y0 + 12, CELL - 20, CELL - 22);
          win(g, r, x0 + CELL / 2, y0 + 20, 1.9 * PX_M, 2.1 * PY_M, { frame: '#e8e8e8', cols: 3, rows: 2, sill: false });
          const hue = [205, 30, 95, 350][Math.floor(r() * 4)];
          g.fillStyle = `hsl(${hue},${18 + r() * 20}%,${58 + r() * 14}%)`;
          g.fillRect(x0 + 8, y0 + 72, CELL - 16, 42);
          g.fillStyle = 'rgba(0,0,0,0.2)';
          g.fillRect(x0 + 8, y0 + 112, CELL - 16, 4);
        } else {
          win(g, r, x0 + CELL / 2, y0 + 34, 1.75 * PX_M, 1.45 * PY_M, { frame: '#efefec', cols: 3, rows: 2, transom: 0.35 });
        }
      }
    }
    door(g, 2, '#6b6a66');
  },

  // biurowiec 1970-2000: pasmowe okna ze slupkami i plyty podokienne, przeszklony parter
  biurowiec(g, r) {
    base(g, r, '#e6e6e4', 12);
    for (let row = 1; row < 4; row++) {
      const y = rowTop(row) + 34, h = 1.75 * PY_M;
      for (let x = 0; x < S; x += 32) {
        g.fillStyle = '#b9bcbf';
        g.fillRect(x, y, 4, h);
        glass(g, r, x + 4, y, 28, h, [45, 55, 66]);
      }
      hline(g, y - 3, 3, '#9fa3a6');
      hline(g, y + h, 4, '#c9cbcc');
    }
    const y0 = rowTop(0);
    g.fillStyle = '#34383c';
    g.fillRect(0, y0 + 12, S, S - y0 - 12);
    for (let x = 0; x < S; x += 64) glass(g, r, x + 4, y0 + 16, 56, S - y0 - 24, [40, 48, 56]);
    door(g, 1, '#2c3035');
  },

  // socrealizm (MDM, Marszalkowska): kamienne bloki, wysokie okna w glebokich osciezach, plyciny, granitowy parter
  socrealizm(g, r) {
    base(g, r, '#ece4d4', 18);
    for (let yy = 0; yy < rowTop(0); yy += 18) hline(g, yy, 1, 'rgba(0,0,0,0.08)');
    for (let row = 1; row < 4; row++) {
      const y0 = rowTop(row);
      for (let b = 0; b < 4; b++) {
        const cx = b * CELL + CELL / 2, w = 1.3 * PX_M, h = 2.25 * PY_M;
        win(g, r, cx, y0 + 16, w, h, { frame: '#e9e3d6', reveal: 'rgba(0,0,0,0.22)', cols: 2, rows: 3 });
        g.fillStyle = 'rgba(0,0,0,0.1)';
        g.fillRect(cx - w / 2, y0 + 16 + h + 10, w, 12);
      }
      if (row === 3) {
        hline(g, y0, 10, 'rgba(0,0,0,0.18)');
        hline(g, y0 + 10, 3, 'rgba(255,255,255,0.4)');
      }
    }
    const y0 = rowTop(0);
    g.fillStyle = '#7d766c';
    g.fillRect(0, y0, S, CELL);
    for (let yy = y0; yy < S; yy += 20) hline(g, yy, 2, 'rgba(0,0,0,0.15)');
    for (let b = 0; b < 4; b++) {
      g.fillStyle = '#2f3134';
      g.fillRect(b * CELL + 14, y0 + 14, CELL - 28, CELL - 14);
      glass(g, r, b * CELL + 18, y0 + 18, CELL - 36, CELL - 26, [40, 46, 52]);
    }
  },

  // Stare i Nowe Miasto: tynk, mniejsze okna z podzialem na kwatery, portale i sklepiki
  stare_miasto(g, r) {
    base(g, r, '#f3ede2', 26, 7000);
    for (let row = 1; row < 4; row++) {
      const y0 = rowTop(row);
      for (let b = 0; b < 4; b++) {
        const cx = b * CELL + CELL / 2, w = 1.0 * PX_M, h = 1.65 * PY_M;
        g.fillStyle = 'rgba(255,255,255,0.5)';
        g.fillRect(cx - w / 2 - 7, y0 + 19, w + 14, h + 14);
        win(g, r, cx, y0 + 26, w, h, { frame: '#faf8f4', cols: 2, rows: 3, bar: 2 });
      }
      hline(g, y0 + CELL - 4, 3, 'rgba(0,0,0,0.07)');
    }
    const y0 = rowTop(0);
    hline(g, S - 16, 16, 'rgba(0,0,0,0.12)');
    for (let b = 0; b < 4; b++) {
      if (b % 2 === 0) door(g, b, '#5b3b2a', true);
      else win(g, r, b * CELL + CELL / 2, y0 + 30, 1.3 * PX_M, 1.9 * PY_M, { frame: '#3d3b38', cols: 2, rows: 3, bar: 2 });
    }
  },

  // hale, garaze, zaplecza: blacha falista, rzad malych okien, brama
  przemysl(g, r) {
    base(g, r, '#dcdcd8', 10);
    for (let x = 0; x < S; x += 9) {
      g.fillStyle = 'rgba(0,0,0,0.07)';
      g.fillRect(x, 0, 3, S);
      g.fillStyle = 'rgba(255,255,255,0.18)';
      g.fillRect(x + 4, 0, 2, S);
    }
    const yw = rowTop(2) + 40;
    for (let x = 16; x < S; x += 64) glass(g, r, x, yw, 40, 26, [60, 66, 70]);
    const y0 = rowTop(0);
    g.fillStyle = '#9ea2a3';
    g.fillRect(CELL + 10, y0 + 20, CELL * 1.4, S - y0 - 20);
    for (let yy = y0 + 24; yy < S; yy += 8) hline(g, yy, 2, 'rgba(0,0,0,0.12)');
    door(g, 3, '#5d6468');
  },

  // nowe osiedla i plomby (po 2000): duze okna, szklane balustrady, wstawki okladziny
  nowy(g, r) {
    base(g, r, '#f2f1ee', 10);
    for (let row = 1; row < 4; row++) {
      const y0 = rowTop(row);
      for (let b = 0; b < 4; b++) {
        const x0 = b * CELL;
        if (b === 0 || b === 2) {
          g.fillStyle = b === 0 ? 'rgba(120,86,60,0.22)' : 'rgba(40,44,48,0.18)';
          g.fillRect(x0 + 8, y0, CELL - 16, CELL);
        }
        win(g, r, x0 + CELL / 2, y0 + 12, 1.6 * PX_M, 2.45 * PY_M, { frame: '#55585c', cols: 2, rows: 1, sill: false });
        if (b === 1 || b === 3) {
          g.fillStyle = 'rgba(200,215,220,0.45)';
          g.fillRect(x0 + 6, y0 + 74, CELL - 12, 40);
          g.fillStyle = 'rgba(80,85,90,0.8)';
          g.fillRect(x0 + 6, y0 + 72, CELL - 12, 3);
        }
      }
      hline(g, y0 + CELL - 6, 6, 'rgba(0,0,0,0.1)');
    }
    for (let b = 0; b < 4; b++) {
      if (b === 1) door(g, b, '#3e4246');
      else shopfront(g, r, b, { frame: '#44484c', sign: false });
    }
  },

  // ogolny starszy budynek
  dawny(g, r) {
    base(g, r, '#f2f0ec', 20, 6000);
    for (let row = 0; row < 4; row++) {
      const y0 = rowTop(row);
      hline(g, y0 + CELL - 6, 4, 'rgba(0,0,0,0.07)');
      for (let b = 0; b < 4; b++) {
        win(g, r, b * CELL + CELL / 2, y0 + 26, CELL * 0.48, CELL * 0.56, { frame: '#ebe8e2', cols: 2, rows: 2, transom: 0.3 });
      }
    }
  },
};

// Tablica tekstur (sampler2DArray): warstwa = styl
export function facadeStyles(renderer) {
  const n = FACADE_STYLES.length;
  const data = new Uint8Array(S * S * 4 * n);
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d', { willReadFrequently: true });
  FACADE_STYLES.forEach((name, i) => {
    g.clearRect(0, 0, S, S);
    PAINTERS[name](g, rng(101 + i * 17));
    const img = g.getImageData(0, 0, S, S).data;
    g.fillStyle = '#000';
    g.fillRect(0, 0, S, S);
    PAINTERS[name](maskContext(g), rng(101 + i * 17));
    const mask = g.getImageData(0, 0, S, S).data;
    for (let p = 3; p < img.length; p += 4) img[p] = mask[p - 3];
    // wiersz 0 danych = dol obrazu (v = 0) - tablice tekstur nie maja flipY
    for (let y = 0; y < S; y++) data.set(img.subarray((S - 1 - y) * S * 4, (S - y) * S * 4), (i * S * S + y * S) * 4);
  });
  const tex = new THREE.DataArrayTexture(data, S, S, n);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  tex.needsUpdate = true;
  return tex;
}

// Sciana szklana (curtain wall): tafla ~1.8 m x 1 pietro, jasne ramy, ciemniejszy pas stropu co pietro.
// Tafle ciemne (szklo przepuszcza malo swiatla z wnetrza) z roznicami - czesc odbija mocniej, czesc z zaluzjami;
// kolor budynku (np. zielonkawy, stalowy, grafitowy) mnozy teksture, a odbicia nieba dodaje mapa otoczenia.
export const GLASS_CELLS = 4;
export function glassTexture(renderer) {
  const S = 512, cell = S / GLASS_CELLS, pw = cell / 2;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  const r = rng(11);
  for (let y = 0; y < GLASS_CELLS; y++) {
    for (let x = 0; x < GLASS_CELLS * 2; x++) {
      const k = r();
      let v = 124 + r() * 18;
      if (k > 0.94) v = 150 + r() * 14;       // tafla z opuszczona roleta / jasnym wnetrzem
      else if (k < 0.08) v = 108 + r() * 8;   // ciemne wnetrze
      const grad = g.createLinearGradient(0, y * cell, 0, y * cell + cell);
      grad.addColorStop(0, `rgb(${v * 0.96 + 10},${v + 10},${v * 1.03 + 12})`);
      grad.addColorStop(1, `rgb(${v * 0.92},${v * 0.97},${v})`);
      g.fillStyle = grad;
      g.fillRect(x * pw, y * cell, pw, cell);
    }
    // pas stropu (spandrel) i rygiel
    g.fillStyle = '#6d747b';
    g.fillRect(0, y * cell + cell - 22, S, 22);
    g.fillStyle = '#c9ced2';
    g.fillRect(0, y * cell + cell - 24, S, 3);
  }
  g.fillStyle = '#c3c8cc';
  for (let x = 0; x < GLASS_CELLS * 2; x++) g.fillRect(x * pw, 0, 3, S);
  return makeTexture(c, renderer);
}

export function noiseTexture(renderer, { size = 256, base = 200, amp = 40, seed = 3 } = {}) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const img = g.createImageData(size, size);
  const r = rng(seed);
  for (let i = 0; i < size * size; i++) {
    const v = base + (r() - 0.5) * amp;
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return makeTexture(c, renderer);
}

export function asphaltTexture(renderer) {
  const S = 256;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  const r = rng(5);
  g.fillStyle = '#d0d0d0';
  g.fillRect(0, 0, S, S);
  for (let i = 0; i < 9000; i++) {
    const v = 150 + Math.floor(r() * 100);
    g.fillStyle = `rgba(${v},${v},${v},0.5)`;
    g.fillRect(r() * S, r() * S, 1.5, 1.5);
  }
  for (let i = 0; i < 12; i++) {
    g.fillStyle = `rgba(90,90,90,${0.05 + r() * 0.06})`;
    g.beginPath();
    g.ellipse(r() * S, r() * S, 10 + r() * 40, 6 + r() * 20, r() * 3, 0, Math.PI * 2);
    g.fill();
  }
  return makeTexture(c, renderer);
}
