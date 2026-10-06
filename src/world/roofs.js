// Ksztalty dachow z OSM (roof:shape): 1 kopula, 2 piramida (tez przyblizenie czterospadowego), 3 dwuspadowy, 4 jednospadowy.
// makeRoof zwraca trojkaty dachu (i szczytow dla dwuspadowego) oraz funkcje wysokosci dachu w punkcie - do kolizji.
// Pierscien zewnetrzny ma pole > 0 w ukladzie (x,z) (patrz tools/build-city.mjs).

const DOME_RINGS = 7;

function areaCentroid(r) {
  const n = r.length / 2;
  let a = 0, cx = 0, cz = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const cr = r[2 * i] * r[2 * j + 1] - r[2 * j] * r[2 * i + 1];
    a += cr;
    cx += (r[2 * i] + r[2 * j]) * cr;
    cz += (r[2 * i + 1] + r[2 * j + 1]) * cr;
  }
  if (Math.abs(a) < 1e-6) {
    let x = 0, z = 0;
    for (let i = 0; i < n; i++) { x += r[2 * i]; z += r[2 * i + 1]; }
    return [x / n, z / n];
  }
  return [cx / (3 * a), cz / (3 * a)];
}

function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
function norm(v) { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; }

// trojkat zwrocony "od" punktu ref (na zewnatrz bryly); nA..nC - normalne wierzcholkow (null = plaska)
function tri(out, kind, A, B, C, ref, nA, nB, nC) {
  const fn = norm(cross(sub(B, A), sub(C, A)));
  const mid = [(A[0] + B[0] + C[0]) / 3, (A[1] + B[1] + C[1]) / 3, (A[2] + B[2] + C[2]) / 3];
  const out_ = sub(mid, ref);
  if (fn[0] * out_[0] + fn[1] * out_[1] + fn[2] * out_[2] < 0) {
    [B, C] = [C, B];
    [nB, nC] = [nC, nB];
    fn[0] = -fn[0]; fn[1] = -fn[1]; fn[2] = -fn[2];
  }
  out.push({ kind, p: [A, B, C], n: [nA || fn, nB || fn, nC || fn] });
}

export function makeRoof(b) {
  if (!b.rs || b.h) return null;
  const top = b.t, base = b.b || 0;
  const rh = Math.min(b.rh, top - base);
  if (rh < 0.3) return null;
  const wallTop = top - rh;
  const r = b.o, n = r.length / 2;
  const shape = b.rs === 3 && n !== 4 ? 2 : b.rs;
  const tris = [];

  if (shape === 1 || shape === 2) {
    const [cx, cz] = areaCentroid(r);
    const dome = shape === 1;
    const N = dome ? DOME_RINGS : 1;
    // poziome normalne zewnetrzne w wierzcholkach (srednia sasiednich krawedzi)
    const hn = [];
    for (let i = 0; i < n; i++) {
      const p = (i - 1 + n) % n, q = (i + 1) % n;
      const e1x = r[2 * i] - r[2 * p], e1z = r[2 * i + 1] - r[2 * p + 1];
      const e2x = r[2 * q] - r[2 * i], e2z = r[2 * q + 1] - r[2 * i + 1];
      const l1 = Math.hypot(e1x, e1z) || 1, l2 = Math.hypot(e2x, e2z) || 1;
      let nx = e1z / l1 + e2z / l2, nz = -e1x / l1 - e2x / l2;
      const l = Math.hypot(nx, nz) || 1;
      hn.push([nx / l, nz / l]);
    }
    const ring = (k) => {
      const th = (k / N) * Math.PI / 2;
      const s = dome ? Math.cos(th) : 1 - k / N;
      const y = wallTop + rh * (dome ? Math.sin(th) : k / N);
      const pts = [], nrm = [];
      for (let i = 0; i < n; i++) {
        pts.push([cx + (r[2 * i] - cx) * s, y, cz + (r[2 * i + 1] - cz) * s]);
        nrm.push(dome ? norm([hn[i][0] * Math.cos(th), Math.sin(th), hn[i][1] * Math.cos(th)]) : null);
      }
      return { pts, nrm };
    };
    const ref = [cx, wallTop - rh * 0.25, cz];
    const apex = [cx, top, cz];
    const rings = [];
    for (let k = 0; k < N; k++) rings.push(ring(k));
    for (let k = 0; k < N; k++) {
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        const a = rings[k].pts[i], bb = rings[k].pts[j];
        const na = rings[k].nrm[i], nb = rings[k].nrm[j];
        if (k + 1 < N) {
          const a2 = rings[k + 1].pts[i], b2 = rings[k + 1].pts[j];
          const na2 = rings[k + 1].nrm[i], nb2 = rings[k + 1].nrm[j];
          tri(tris, 'roof', a, b2, bb, ref, na, nb2, nb);
          tri(tris, 'roof', a, a2, b2, ref, na, na2, nb2);
        } else {
          tri(tris, 'roof', a, apex, bb, ref, na, dome ? [0, 1, 0] : null, nb);
        }
      }
    }
    const radial = (x, z) => {
      const dx = x - cx, dz = z - cz, d = Math.hypot(dx, dz);
      if (d < 1e-6) return 0;
      const ux = dx / d, uz = dz / d;
      let tmin = Infinity;
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        const ax = r[2 * i], az = r[2 * i + 1];
        const ex = r[2 * j] - ax, ez = r[2 * j + 1] - az;
        const den = ux * ez - uz * ex;
        if (Math.abs(den) < 1e-9) continue;
        const wx = ax - cx, wz = az - cz;
        const t = (wx * ez - wz * ex) / den, s = (wx * uz - wz * ux) / den;
        if (t > 0 && s >= 0 && s <= 1 && t < tmin) tmin = t;
      }
      return tmin === Infinity ? 1 : Math.min(1, d / tmin);
    };
    const topAt = dome
      ? (x, z) => { const s = radial(x, z); return wallTop + rh * Math.sqrt(Math.max(0, 1 - s * s)); }
      : (x, z) => wallTop + rh * (1 - radial(x, z));
    return { wallTop, tris, topAt, wallTopAt: () => wallTop };
  }

  if (shape === 3) {
    // dwuspadowy na czworokacie: kalenica rownolegla do dluzszych bokow (albo w poprzek: roof:orientation=across)
    const v = [0, 1, 2, 3].map(i => [r[2 * i], wallTop, r[2 * i + 1]]);
    const len = (a, c) => Math.hypot(a[0] - c[0], a[2] - c[2]);
    let o = (len(v[0], v[1]) + len(v[2], v[3]) >= len(v[1], v[2]) + len(v[3], v[0])) ? 0 : 1;
    if (b.ra) o = 1 - o;
    const [p0, p1, p2, p3] = [0, 1, 2, 3].map(i => v[(i + o) % 4]);
    const mid = (a, c) => [(a[0] + c[0]) / 2, top, (a[2] + c[2]) / 2];
    const m1 = mid(p1, p2), m3 = mid(p3, p0);
    const [cx, cz] = areaCentroid(r);
    const ref = [cx, wallTop - rh, cz];
    tri(tris, 'roof', p0, p1, m1, ref); tri(tris, 'roof', p0, m1, m3, ref);
    tri(tris, 'roof', p2, p3, m3, ref); tri(tris, 'roof', p2, m3, m1, ref);
    tri(tris, 'gable', p1, p2, m1, [cx, wallTop, cz]);
    tri(tris, 'gable', p3, p0, m3, [cx, wallTop, cz]);
    // wysokosc dachu: od kalenicy (m3->m1) w dol do okapu
    const rx = m1[0] - m3[0], rz = m1[2] - m3[2], rl = Math.hypot(rx, rz) || 1;
    const distToRidge = (x, z) => Math.abs((x - m3[0]) * rz - (z - m3[2]) * rx) / rl;
    const halfW = Math.max(0.5, (distToRidge(p0[0], p0[2]) + distToRidge(p2[0], p2[2])) / 2);
    const topAt = (x, z) => wallTop + rh * Math.max(0, 1 - distToRidge(x, z) / halfW);
    return { wallTop, tris, topAt, wallTopAt: () => wallTop };
  }

  if (shape === 4) {
    // jednospadowy: plaszczyzna opadajaca w kierunku roof:direction (0 = polnoc = -z, 90 = wschod = +x)
    const a = (b.rd || 0) * Math.PI / 180;
    const dx = Math.sin(a), dz = -Math.cos(a);
    let pmin = Infinity, pmax = -Infinity;
    for (let i = 0; i < n; i++) {
      const pr = r[2 * i] * dx + r[2 * i + 1] * dz;
      pmin = Math.min(pmin, pr); pmax = Math.max(pmax, pr);
    }
    const span = Math.max(0.5, pmax - pmin);
    const yAt = (x, z) => top - rh * ((x * dx + z * dz) - pmin) / span;
    const g = -rh / span;
    const nrm = norm([-g * dx, 1, -g * dz]);
    return { wallTop, tris: null, planeNormal: nrm, topAt: yAt, wallTopAt: yAt };
  }
  return null;
}
