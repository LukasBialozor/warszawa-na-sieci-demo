# Palac Kultury i Nauki (Lew Rudniew, 1952-55) -> public/models/pkin.glb
#
# Wieza modelowana parametrycznie, skrzydla z bryly LOD2 GUGiK (dachy na wlasciwych wysokosciach, Sala Kongresowa).
# Wymiary (LOD2 2012 + dane PKiN): szyb 39.8 x 40 m, cztery narozne wieze 18 x 19 m do 66.9 m (z koronami attyk),
# korona szybu do ~130 m, wiezyczka 18.9 m do 162.1 m (arkady), latarnia 12.4 m do 180.9 m z zegarem (4 tarcze
# 6.3 m, 2000 r.), "chinski" daszek do 186.2 m (zielona patyna), iglica ~43 m (kula >5 m, maszt 1.5 m, zolta farba)
# do 230.7 m + wspornik anteny do 237 m. Elewacja: piaskowe plytki ceramiczne (dzis brazowoszare), pionowe lizeny,
# renesansowe attyki ze sterczynami na kazdym uskoku (wzory z Kazimierza, Krakowa, Zamoscia).
#
# Uruchomienie: blender -b --factory-startup -P blender/pkin.py -- [--preview PLIK.png]
import math
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy  # noqa: E402
from mathutils import geometry  # noqa: E402

import lm_common as lm  # noqa: E402

lm.reset()

# os wiezy (wierzcholek iglicy LOD2) i kierunek osi budynku (krawedzie szybu)
F = lm.Frame(12.04, 3.49, -20.4)

# ------------------------------------------------------------------ tekstury
def tex_wall():
    """Elewacja: piaskowe plytki, okno (komorka 2.4 m x 3.6 m = 1 okno x 1 pietro)."""
    W, H = 128, 192
    yy = (np.arange(H)[::-1][:, None] / H) * 3.6
    xx = np.arange(W)[None, :] / W * 2.4
    rng = np.random.default_rng(11)
    img = np.zeros((H, W, 3))
    img[:] = (0.80, 0.73, 0.60)
    tiles = ((np.floor(yy / 0.3) + np.floor(xx / 0.6)) % 2) * 0.015
    img *= (1 - tiles[..., None])
    img += rng.normal(0, 0.012, img.shape)
    win = (yy > 0.9) & (yy < 2.95) & (xx > 0.62) & (xx < 1.78)
    img[np.broadcast_to(win, (H, W))] = (0.16, 0.18, 0.20)
    glass_hi = win & (yy > 2.2)
    img[np.broadcast_to(glass_hi, (H, W))] = (0.24, 0.27, 0.30)
    frame = win & ((np.abs(xx - 1.2) < 0.03) | (np.abs(yy - 2.2) < 0.03))
    img[np.broadcast_to(frame, (H, W))] = (0.55, 0.52, 0.46)
    sill = (yy > 0.78) & (yy < 0.9) & (xx > 0.52) & (xx < 1.88)
    img[np.broadcast_to(sill, (H, W))] = (0.66, 0.60, 0.50)
    reveal = ((yy > 0.9) & (yy < 3.05) & (((xx > 0.52) & (xx < 0.62)) | ((xx > 1.78) & (xx < 1.88)))) | \
             ((yy > 2.95) & (yy < 3.05) & (xx > 0.52) & (xx < 1.88))
    img[np.broadcast_to(reveal, (H, W))] *= 0.8
    return lm.save_texture('pkin_wall', img)


def tex_tower():
    """Wieza: jedno przeslo miedzy lizenami x 1 pietro (4 m). Ciemny pionowy pas okien przez cala wysokosc,
    ze spandrelami (plycinami podokiennymi) - daje charakterystyczne pionowe "prazki" PKiN."""
    W, H = 128, 128
    yy = (np.arange(H)[::-1][:, None] / H) * 4.0
    xx = np.arange(W)[None, :] / W
    rng = np.random.default_rng(13)
    img = np.zeros((H, W, 3))
    img[:] = (0.79, 0.72, 0.59)
    img *= (1 - (((np.floor(yy / 0.33) + np.floor(xx * 8)) % 2) * 0.015))[..., None]
    img += rng.normal(0, 0.01, img.shape)
    strip = (np.abs(xx - 0.5) < 0.2)
    img[np.broadcast_to(strip, (H, W))] = (0.18, 0.20, 0.22)
    glass = strip & (yy > 1.25) & (yy < 3.75)
    img[np.broadcast_to(glass, (H, W))] = (0.21, 0.24, 0.27)
    mull = glass & (np.abs(xx - 0.5) < 0.012)
    img[np.broadcast_to(mull, (H, W))] = (0.5, 0.47, 0.42)
    spandrel = strip & (yy > 0.2) & (yy < 1.1)
    img[np.broadcast_to(spandrel, (H, W))] = (0.50, 0.45, 0.37)
    edge = (np.abs(np.abs(xx - 0.5) - 0.2) < 0.02)
    img[np.broadcast_to(edge, (H, W))] *= 0.75
    return lm.save_texture('pkin_tower', img)


def tex_plain():
    W = H = 128
    yy, xx = np.mgrid[0:H, 0:W] / H
    rng = np.random.default_rng(12)
    img = np.zeros((H, W, 3))
    img[:] = (0.82, 0.75, 0.62)
    img *= (1 - (((np.floor(yy * 12) + np.floor(xx * 6)) % 2) * 0.02))[..., None]
    img += rng.normal(0, 0.012, img.shape)
    return lm.save_texture('pkin_plain', img)


def tex_clock():
    S = 512
    yy, xx = (np.mgrid[0:S, 0:S] + 0.5) / S * 2 - 1
    yy = -yy                  # w gore dodatnio (wiersz 0 = gora obrazu)
    r = np.hypot(xx, yy)
    ang = np.arctan2(xx, yy)  # 0 = godzina 12, zgodnie ze wskazowkami
    img = np.zeros((S, S, 3))
    img[:] = (0.80, 0.73, 0.60)
    face = r < 0.96
    img[face] = (0.95, 0.95, 0.93)
    ring = (r > 0.90) & (r < 0.96)
    img[ring] = (0.15, 0.15, 0.16)
    for k in range(60):
        a = k / 60 * 2 * np.pi
        d = np.abs(np.angle(np.exp(1j * (ang - a))))
        long = k % 5 == 0
        mark = (d * r < (0.035 if long else 0.012)) & (r > (0.72 if long else 0.80)) & (r < 0.88)
        img[mark] = (0.1, 0.1, 0.1)

    def hand(a, length, width):
        ux, uy = np.sin(a), np.cos(a)
        t = xx * ux + yy * uy
        n = np.abs(xx * uy - yy * ux)
        return (t > -0.08) & (t < length) & (n < width * (1 - 0.6 * np.clip(t / length, 0, 1)))
    img[hand(np.radians(305), 0.52, 0.045)] = (0.08, 0.08, 0.09)   # godzinowa ~10
    img[hand(np.radians(60), 0.80, 0.03)] = (0.08, 0.08, 0.09)     # minutowa ~10
    img[r < 0.05] = (0.08, 0.08, 0.09)
    return lm.save_texture('pkin_clock', img)


M_WALL = lm.material('pkin_wall', '#ffffff', rough=0.8, image=tex_wall())
M_TOWER = lm.material('pkin_tower', '#ffffff', rough=0.8, image=tex_tower())
TFLOOR = 4.0
M_PLAIN = lm.material('pkin_plain', '#f2ece0', rough=0.85, image=tex_plain())
M_DARK = lm.material('pkin_arcade', '#2b2d2f', rough=0.7)
M_ROOF = lm.material('pkin_roof', '#7d7f7c', rough=0.9)
M_COPPER = lm.material('pkin_copper', '#5f8f7d', rough=0.6, metal=0.3)
M_GOLD = lm.material('pkin_spire', '#e0b43a', rough=0.4, metal=0.6)
M_BULB = lm.material('pkin_bulb', '#3a3b36', rough=0.5, metal=0.5)
M_CLOCK = lm.material('pkin_clock', '#ffffff', rough=0.5, image=tex_clock())
WIN, FLOOR = 2.4, 3.6

m = lm.Mesh('pkin')
deco = lm.Mesh('pkin_detale')   # attyki, sterczyny, gzymsy (bez kolizji ani raycastow - drobne detale)
prisms = []


# ------------------------------------------------------------------ elementy dekoracyjne
def seg_normal(a, b):
    """Normalna na zewnatrz dla krawedzi pierscienia o obiegu orient_out (ring_area < 0): (-dz, dx)."""
    dx, dz = b[0] - a[0], b[1] - a[1]
    L = math.hypot(dx, dz) or 1
    return (-dz / L, dx / L), L


def pinnacle(mesh, x, z, y0, w, h, ang_dx=1.0, ang_dz=0.0, cap=0.45, mat=None):
    """Sterczyna: trzon kwadratowy w x w (obrocony wg kierunku), zakonczony smuklym ostroslupem (cap = udzial wysokosci)."""
    mat = mat or M_PLAIN
    L = math.hypot(ang_dx, ang_dz) or 1
    ex, ez = ang_dx / L * w / 2, ang_dz / L * w / 2
    fx, fz = -ez, ex
    ring = [(x - ex - fx, z - ez - fz), (x + ex - fx, z + ez - fz), (x + ex + fx, z + ez + fz), (x - ex + fx, z - ez + fz)]
    r = lm.orient_out(ring)
    y1 = y0 + h * (1 - cap)
    lm.wall_strip(mesh, r, y0, y1, mat, win=w, floor=w)
    # gzymsik i ostroslup
    apex = (x, y0 + h, z)
    for i in range(4):
        a, b = r[i], r[(i + 1) % 4]
        mesh.poly([(a[0], y1, a[1]), (b[0], y1, b[1]), apex], mat, [(0, 0), (1, 0), (0.5, 1)])


def attic(mesh, ring, y, h=1.8, t=0.5, pin_step=2.6, pin_w=0.45, pin_h=1.6, corner_w=1.3, corner_h=4.5,
          cornice=True, edges=None):
    """Attyka na obrysie ring [(x,z)] na wysokosci y: gzyms, parapet, male sterczyny co pin_step i duze na narozach.
    edges: lista flag (czy krawedz i -> i+1 jest zewnetrzna); None = wszystkie."""
    r = lm.orient_out(ring)
    n = len(r)
    if edges is not None and lm.ring_area(ring) >= 0:
        # orient_out odwrocil kolejnosc - odwracamy tez flagi krawedzi
        edges = [edges[(n - 2 - i) % n] for i in range(n)]
    for i in range(n):
        if edges is not None and not edges[i]:
            continue
        a, b = r[i], r[(i + 1) % n]
        (nx, nz), L = seg_normal(a, b)
        if L < 0.5:
            continue
        # gzyms (wysuniety 0.6 m, 0.7 m wysoki)
        if cornice:
            ao, bo = (a[0] + nx * 0.6, a[1] + nz * 0.6), (b[0] + nx * 0.6, b[1] + nz * 0.6)
            mesh.poly([(ao[0], y - 0.7, ao[1]), (bo[0], y - 0.7, bo[1]), (bo[0], y, bo[1]), (ao[0], y, ao[1])], M_PLAIN,
                      [(0, 0), (L / 3, 0), (L / 3, 0.2), (0, 0.2)])
            mesh.poly([(a[0], y - 0.7, a[1]), (b[0], y - 0.7, b[1]), (bo[0], y - 0.7, bo[1]), (ao[0], y - 0.7, ao[1])], M_PLAIN)
            mesh.poly([(ao[0], y, ao[1]), (bo[0], y, bo[1]), (b[0], y, b[1]), (a[0], y, a[1])], M_PLAIN)
        # parapet: zewnetrzna i wewnetrzna sciana + wierzch
        ai, bi = (a[0] - nx * t, a[1] - nz * t), (b[0] - nx * t, b[1] - nz * t)
        mesh.poly([(a[0], y, a[1]), (b[0], y, b[1]), (b[0], y + h, b[1]), (a[0], y + h, a[1])], M_PLAIN,
                  [(0, 0), (L / 3, 0), (L / 3, h / 3), (0, h / 3)])
        mesh.poly([(bi[0], y, bi[1]), (ai[0], y, ai[1]), (ai[0], y + h, ai[1]), (bi[0], y + h, bi[1])], M_PLAIN)
        mesh.poly([(a[0], y + h, a[1]), (b[0], y + h, b[1]), (bi[0], y + h, bi[1]), (ai[0], y + h, ai[1])], M_PLAIN)
        # male sterczyny
        k = max(1, int(L / pin_step))
        for j in range(1, k):
            s = j / k
            px = a[0] + (b[0] - a[0]) * s - nx * t / 2
            pz = a[1] + (b[1] - a[1]) * s - nz * t / 2
            pinnacle(mesh, px, pz, y + h, pin_w, pin_h, b[0] - a[0], b[1] - a[1])
    # duze sterczyny na narozach wypuklych
    for i in range(n):
        p0, p1, p2 = r[i - 1], r[i], r[(i + 1) % n]
        if edges is not None and not (edges[i - 1] and edges[i]):
            continue
        cross = (p1[0] - p0[0]) * (p2[1] - p1[1]) - (p1[1] - p0[1]) * (p2[0] - p1[0])
        # obieg orient_out (pole < 0 w ukladzie x/z): naroze wypukle ma cross < 0
        if cross < -1e-6:
            (n0x, n0z), _ = seg_normal(p0, p1)
            (n1x, n1z), _ = seg_normal(p1, p2)
            cx, cz = p1[0] - (n0x + n1x) * corner_w * 0.35, p1[1] - (n0z + n1z) * corner_w * 0.35
            pinnacle(mesh, cx, cz, y, corner_w, corner_h, p2[0] - p1[0], p2[1] - p1[1], cap=0.5)


def cornice(mesh, ring, y, depth=0.8, h=0.9):
    """Gzyms dookola obrysu na wysokosci y (wysuniety o depth)."""
    r = lm.orient_out(ring)
    for i in range(len(r)):
        a, b = r[i], r[(i + 1) % len(r)]
        (nx, nz), L = seg_normal(a, b)
        ao, bo = (a[0] + nx * depth, a[1] + nz * depth), (b[0] + nx * depth, b[1] + nz * depth)
        mesh.poly([(ao[0], y - h, ao[1]), (bo[0], y - h, bo[1]), (bo[0], y, bo[1]), (ao[0], y, ao[1])], M_PLAIN)
        mesh.poly([(a[0], y - h, a[1]), (b[0], y - h, b[1]), (bo[0], y - h, bo[1]), (ao[0], y - h, ao[1])], M_PLAIN)
        mesh.poly([(ao[0], y, ao[1]), (bo[0], y, bo[1]), (b[0], y, b[1]), (a[0], y, a[1])], M_PLAIN)


def piers(mesh, f, u0, u1, v_face, out_sign, y0, y1, step, w=1.4, d=0.7, axis='u'):
    """Pionowe lizeny na scianie lezacej na v = v_face (axis='u': sciana wzdluz u) lub u = v_face (axis='v')."""
    L = u1 - u0
    k = max(1, int(round(L / step)))
    for j in range(k + 1):
        c = u0 + L * j / k
        a, b = c - w / 2, c + w / 2
        if axis == 'u':
            ring = [f.xz(a, v_face), f.xz(b, v_face), f.xz(b, v_face + out_sign * d), f.xz(a, v_face + out_sign * d)]
        else:
            ring = [f.xz(v_face, a), f.xz(v_face, b), f.xz(v_face + out_sign * d, b), f.xz(v_face + out_sign * d, a)]
        r = lm.orient_out(ring)
        lm.wall_strip(mesh, r, y0, y1, M_PLAIN, win=3.0, floor=3.0)
        lm.cap(mesh, ring, y1, M_PLAIN)


def face_wall(mesh, a, b, y0, y1, mat, cell_w, s0=0.0, floor=None):
    """Prostokatna sciana a->b (x, z) (obieg orient_out = na zewnatrz); UV u od s0 w jednostkach komorki cell_w."""
    floor = floor or TFLOOR
    L = math.hypot(b[0] - a[0], b[1] - a[1])
    u0, u1 = s0, s0 + L / cell_w
    mesh.poly([(a[0], y0, a[1]), (b[0], y0, b[1]), (b[0], y1, b[1]), (a[0], y1, a[1])], mat,
              [(u0, y0 / floor), (u1, y0 / floor), (u1, y1 / floor), (u0, y1 / floor)])


def tower_block(mesh, f, u0, u1, v0, v1, y0, y1, bay_u, bay_v, first_u, first_v, name, mat=None):
    """Prostopadloscian wiezy z UV scian dopasowanym do przesel: komorka = przeslo, pierwsza lizena na first_u/v."""
    mat = mat or M_TOWER
    ring = [f.xz(u0, v0), f.xz(u1, v0), f.xz(u1, v1), f.xz(u0, v1)]
    # obieg na zewnatrz (u w prawo, v w dol): (u0,v0)->(u0,v1)->(u1,v1)->(u1,v0)
    corners = [(u0, v0), (u0, v1), (u1, v1), (u1, v0)]
    for i in range(4):
        (ua, va), (ub, vb) = corners[i], corners[(i + 1) % 4]
        along_u = abs(ub - ua) > 1e-6
        bay, first = (bay_u, first_u) if along_u else (bay_v, first_v)
        start = ua if along_u else va
        s0 = (start - first) / bay if (ub > ua or vb > va) else (first - start) / bay
        face_wall(mesh, f.xz(ua, va), f.xz(ub, vb), y0, y1, mat, bay, s0)
    lm.cap(mesh, ring, y1, M_ROOF)
    prisms.append(lm.prism_json(ring, y0, y1, name))
    return ring


def block(mesh, f, u0, u1, v0, v1, y0, y1, mat=M_WALL, top=True, name=None, collide=True):
    ring = [f.xz(u0, v0), f.xz(u1, v0), f.xz(u1, v1), f.xz(u0, v1)]
    lm.wall_strip(mesh, lm.orient_out(ring), y0, y1, mat, win=WIN, floor=FLOOR)
    if top:
        lm.cap(mesh, ring, y1, M_ROOF)
    if collide:
        prisms.append(lm.prism_json(ring, y0, y1, name))
    return ring


def notched(f, hu, hv, n):
    """Obrys prostokata z wycietymi narozami (schodek n x n) w ukladzie f."""
    pts = [(-hu + n, -hv), (hu - n, -hv), (hu - n, -hv + n), (hu, -hv + n), (hu, hv - n), (hu - n, hv - n), (hu - n, hv),
           (-hu + n, hv), (-hu + n, hv - n), (-hu, hv - n), (-hu, -hv + n), (-hu + n, -hv + n)]
    return [f.xz(u, v) for u, v in pts]


# ------------------------------------------------------------------ skrzydla z LOD2
lod = lm.load_json('data/landmarks/pkin_lod2.json')
base = next(b for b in lod if b['top'] < 100)
roofs = []
for r in base['roofs']:
    ys = [p[1] for p in r['outer']]
    if max(ys) > 60:          # dachy naroznych wiez - modelowane nizej
        continue
    outer = [(p[0], p[2]) for p in r['outer']]
    if abs(lm.ring_area(outer)) < 20:
        continue
    roofs.append({'outer': r['outer'], 'holes': r['holes'], 'h': sum(ys) / len(ys), 'ring': outer})

# obrysy wiezy (szyb + wieze narozne) - do sprawdzania sasiedztwa krawedzi
SHAFT_HU, SHAFT_HV = 19.9, 20.0
PYLONS = [(su * 22.6, sv * 25.6) for su in (-1, 1) for sv in (-1, 1)]
PY_HU, PY_HV = 8.75, 9.5
PYLON_TOP = 66.9


def in_ring(r, x, z):
    ins = False
    j = len(r) - 1
    for i in range(len(r)):
        xi, zi = r[i]
        xj, zj = r[j]
        if (zi > z) != (zj > z) and x < (xj - xi) * (z - zi) / (zj - zi) + xi:
            ins = not ins
        j = i
    return ins


def height_at(x, z):
    """Najwyzszy dach w punkcie (skrzydla + wieza)."""
    u, v = F.local(x, z)
    if abs(u) <= SHAFT_HU and abs(v) <= SHAFT_HV:
        return 200.0
    for pu, pv in PYLONS:
        if abs(u - pu) <= PY_HU and abs(v - pv) <= PY_HV:
            return PYLON_TOP
    h = 0.0
    for R in roofs:
        if in_ring(R['ring'], x, z) and not any(in_ring([(p[0], p[2]) for p in hole], x, z) for hole in R['holes']):
            h = max(h, R['h'])
    return h


for R in roofs:
    outer3 = R['outer']
    ring = R['ring']
    hmap = {(round(p[0], 3), round(p[2], 3)): p[1] for p in outer3}
    for hole in R['holes']:
        for p in hole:
            hmap[(round(p[0], 3), round(p[2], 3))] = p[1]
    top_fn = lambda x, z, hm=hmap, hh=R['h']: hm.get((round(x, 3), round(z, 3)), hh)  # noqa: E731
    lm.wall_strip(m, lm.orient_out(ring), 0.0, R['h'], M_WALL, win=WIN, floor=FLOOR, top_fn=top_fn)
    for hole in R['holes']:
        hr = [(p[0], p[2]) for p in hole]
        inner = hr if lm.ring_area(hr) > 0 else hr[::-1]
        lm.wall_strip(m, inner, 0.0, R['h'], M_WALL, win=WIN, floor=FLOOR, top_fn=top_fn)
    # dach (z dziurami) - triangulacja
    from mathutils import Vector
    loops = [[Vector((p[0], p[2], 0)) for p in outer3]] + [[Vector((p[0], p[2], 0)) for p in hole] for hole in R['holes']]
    allp = [p for p in outer3] + [p for hole in R['holes'] for p in hole]
    for tri in geometry.tessellate_polygon(loops):
        pts = [allp[i] for i in tri]
        P = [(p[0], p[1], p[2]) for p in pts]
        # normalna w gore
        (x0, _, z0), (x1, _, z1), (x2, _, z2) = P
        if (x1 - x0) * (z2 - z0) - (z1 - z0) * (x2 - x0) > 0:
            P = [P[0], P[2], P[1]]
        m.poly(P, M_ROOF, [(p[0] / 12, p[2] / 12) for p in P])
    prisms.append(lm.prism_json(ring, 0.0, R['h'], 'Pałac Kultury i Nauki',
                                holes=[[(p[0], p[2]) for p in h] for h in R['holes']] or None))
    # attyki na krawedziach zewnetrznych (sasiad nizej o > 1.5 m)
    r = lm.orient_out(ring)
    flags = []
    for i in range(len(r)):
        a, b = r[i], r[(i + 1) % len(r)]
        (nx, nz), L = seg_normal(a, b)
        mx, mz = (a[0] + b[0]) / 2 + nx * 1.2, (a[1] + b[1]) / 2 + nz * 1.2
        flags.append(L > 1.0 and height_at(mx, mz) < R['h'] - 1.5)
    # attic() oczekuje flag w kolejnosci ringu wejsciowego; przekazujemy juz zorientowany ring
    attic(deco, r, R['h'], h=1.5, pin_step=2.8, pin_w=0.4, pin_h=1.4, corner_w=1.0, corner_h=3.2, edges=flags)

# ------------------------------------------------------------------ wieza
# szyb 39.8 x 40 m z wycietymi narozami, do korony
SHAFT_TOP = 126.0
shaft = notched(F, SHAFT_HU, SHAFT_HV, 2.6)
SH_BAY = (2 * (SHAFT_HU - 2.6)) / 7
r_sh = lm.orient_out(shaft)
for i in range(len(r_sh)):
    a, b = r_sh[i], r_sh[(i + 1) % len(r_sh)]
    L = math.hypot(b[0] - a[0], b[1] - a[1])
    face_wall(m, a, b, 20.0, SHAFT_TOP, M_TOWER, SH_BAY if L > 10 else 2.6, 0.0)
lm.cap(m, shaft, SHAFT_TOP, M_ROOF)
prisms.append(lm.prism_json(shaft, 0.0, SHAFT_TOP, 'Pałac Kultury i Nauki - wieża'))
# Lizeny wystaja 0.7 m ze sciany: kolizja obejmuje je osobna bryla (do wierzchu lizen), inaczej bohater biegnacy
# po scianie mial glowe w lizenie, a kamera startowala z jej wnetrza. Wneki miedzy lizenami zostaja "pelne".
prisms.append(lm.prism_json(notched(F, SHAFT_HU + 0.7, SHAFT_HV + 0.7, 2.6 + 0.7), 30.0, SHAFT_TOP - 1.0,
                            'Pałac Kultury i Nauki - wieża'))
# lizeny na scianach szybu (8 przesel na sciane) + poziome gzymsy
for s in (-1, 1):
    piers(deco, F, -SHAFT_HU + 2.6, SHAFT_HU - 2.6, s * SHAFT_HV, s, 30.0, SHAFT_TOP - 1.0, 4.7, axis='u')
    piers(deco, F, -SHAFT_HV + 2.6, SHAFT_HV - 2.6, s * SHAFT_HU, s, 30.0, SHAFT_TOP - 1.0, 4.7, axis='v')
for yb in (PYLON_TOP + 0.5, 102.0):
    cornice(deco, shaft, yb, depth=1.0, h=1.2)
# korona szybu: attyka z arkadami, sterczyny, duze pinakle w narozach
attic(deco, shaft, SHAFT_TOP, h=1.4, t=0.6, pin_step=3.3, pin_w=0.7, pin_h=3.6, corner_w=2.2, corner_h=4.6)
for su in (-1, 1):
    for sv in (-1, 1):
        cx, cz = F.xz(su * (SHAFT_HU - 1.4), sv * (SHAFT_HV - 1.4))
        pinnacle(deco, cx, cz, SHAFT_TOP, 1.8, 5.0, F.ux, F.uz, cap=0.55)

# wieze narozne 17.5 x 19 m do 66.9 m, z koronami
for (pu, pv) in PYLONS:
    ring = tower_block(m, F, pu - PY_HU, pu + PY_HU, pv - PY_HV, pv + PY_HV, 0.0, PYLON_TOP,
                       (2 * PY_HU - 3.0) / 4, (2 * PY_HV - 3.0) / 4, pu - PY_HU + 1.5, pv - PY_HV + 1.5,
                       'Pałac Kultury i Nauki - wieża narożna')
    su, sv = (1 if pu > 0 else -1), (1 if pv > 0 else -1)
    # lizeny (0.5 m) na dwoch zewnetrznych scianach - kolizja do ich lica
    u0, u1 = pu - PY_HU - (0.5 if su < 0 else 0.0), pu + PY_HU + (0.5 if su > 0 else 0.0)
    v0, v1 = pv - PY_HV - (0.5 if sv < 0 else 0.0), pv + PY_HV + (0.5 if sv > 0 else 0.0)
    prisms.append(lm.prism_json([F.xz(u0, v0), F.xz(u1, v0), F.xz(u1, v1), F.xz(u0, v1)], 22.0, PYLON_TOP - 1.0,
                                'Pałac Kultury i Nauki - wieża narożna'))
    piers(deco, F, pu - PY_HU + 1.5, pu + PY_HU - 1.5, pv + sv * PY_HV, sv, 22.0, PYLON_TOP - 1.0, 3.6, w=1.1, d=0.5, axis='u')
    piers(deco, F, pv - PY_HV + 1.5, pv + PY_HV - 1.5, pu + su * PY_HU, su, 22.0, PYLON_TOP - 1.0, 3.6, w=1.1, d=0.5, axis='v')
    attic(deco, ring, PYLON_TOP, h=2.6, t=0.7, pin_step=2.9, pin_w=0.6, pin_h=2.4, corner_w=1.8, corner_h=6.0)

# wiezyczka 18.9 m do 162.1 m: arkady (ciemne wneki lukow) w gornej czesci
T_HU = 9.45
T_TOP = 162.1
T_BAY = (2 * T_HU - 2.0) / 4
tur = tower_block(m, F, -T_HU, T_HU, -T_HU, T_HU, SHAFT_TOP, T_TOP, T_BAY, T_BAY, -T_HU + 1.0, -T_HU + 1.0,
                  'Pałac Kultury i Nauki - wieżyczka')
for s in (-1, 1):
    for axis in ('u', 'v'):
        piers(deco, F, -T_HU + 1.0, T_HU - 1.0, s * T_HU, s, SHAFT_TOP + 3.2, T_TOP - 1.0, T_BAY, w=1.3, d=0.6, axis=axis)
        # cztery arkady na scianie (w srodkach przesel): prostokat + polkole (wneka)
        for c in (-1.5 * T_BAY, -0.5 * T_BAY, 0.5 * T_BAY, 1.5 * T_BAY):
            y0, y1, hw = 139.0, 153.5, 1.25
            pts = [(c - hw, y0), (c + hw, y0), (c + hw, y1)]
            for k in range(1, 8):
                a = math.pi * k / 8
                pts.append((c + hw * math.cos(a), y1 + hw * math.sin(a)))
            pts.append((c - hw, y1))
            off = s * (T_HU + 0.03)
            P = [F.p(x, y, off) if axis == 'u' else F.p(off, y, x) for x, y in pts]
            # orientacja: normalna na zewnatrz (s * v lub s * u)
            if (axis == 'u') != (s > 0):
                P = P[::-1]
            deco.poly(P, M_DARK)
attic(deco, tur, T_TOP, h=2.4, t=0.6, pin_step=2.9, pin_w=0.55, pin_h=2.2, corner_w=1.6, corner_h=5.2)
TP = T_HU + 0.6
prisms.append(lm.prism_json([F.xz(-TP, -TP), F.xz(TP, -TP), F.xz(TP, TP), F.xz(-TP, TP)], SHAFT_TOP + 3.2, T_TOP - 1.0,
                            'Pałac Kultury i Nauki - wieżyczka'))

# latarnia 12.4 m do 180.9 m z zegarem
L_HU = 6.2
L_TOP = 180.9
lan = block(m, F, -L_HU, L_HU, -L_HU, L_HU, T_TOP, L_TOP, mat=M_PLAIN, name='Pałac Kultury i Nauki - latarnia')
for s in (-1, 1):
    for axis in ('u', 'v'):
        piers(deco, F, -L_HU + 0.6, L_HU - 0.6, s * L_HU, s, T_TOP + 2.4, L_TOP - 0.6, 11.0, w=1.2, d=0.5, axis=axis)
        # tarcza zegara 6.3 m (srodek na 171.5 m)
        R, cy, segs = 3.15, 171.5, 40
        off = s * (L_HU + 0.08)
        ring_pts = []
        uv = []
        for k in range(segs):
            a = 2 * math.pi * k / segs
            ring_pts.append((R * math.cos(a), cy + R * math.sin(a)))
            uv.append((0.5 + 0.5 * math.cos(a), 0.5 + 0.5 * math.sin(a)))
        # tarcza widziana z zewnatrz: "w prawo" = +v dla sciany +u, -u dla sciany +v itd.
        if axis == 'u':
            P = [F.p(s * x, y, off) for x, y in ring_pts]    # sciana v = s*L_HU: patrzac z zewnatrz prawo = s*u
        else:
            P = [F.p(off, y, -s * x) for x, y in ring_pts]   # sciana u = s*L_HU: prawo = -s*v
        # normalna musi wskazywac na zewnatrz; obieg k rosnacy = przeciwnie do wskazowek patrzac z zewnatrz -> OK
        deco.poly(P, M_CLOCK, uv)
attic(deco, lan, L_TOP, h=1.2, t=0.4, pin_step=3.1, pin_w=0.4, pin_h=1.5, corner_w=1.1, corner_h=3.0, cornice=True)
LP = L_HU + 0.5
prisms.append(lm.prism_json([F.xz(-LP, -LP), F.xz(LP, -LP), F.xz(LP, LP), F.xz(-LP, LP)], T_TOP + 2.4, L_TOP - 0.6,
                            'Pałac Kultury i Nauki - latarnia'))

# "chinski" daszek: wklesly ostroslup od 15 m kwadratu (okap) do 5 m, 180.9 -> 186.2
prof = [(7.6, L_TOP + 0.4), (6.2, L_TOP + 1.3), (4.9, L_TOP + 2.6), (3.8, L_TOP + 3.9), (2.9, 186.2)]
rings = [[F.p(-h, y, -h), F.p(h, y, -h), F.p(h, y, h), F.p(-h, y, h)] for h, y in prof]
for i in range(len(rings) - 1):
    r0, r1 = rings[i], rings[i + 1]
    for k in range(4):
        a0, b0, a1, b1 = r0[k], r0[(k + 1) % 4], r1[k], r1[(k + 1) % 4]
        m.poly([b0, a0, a1, b1], M_COPPER)
# spod okapu i wierzch
lm.cap(m, [F.xz(-7.6, -7.6), F.xz(7.6, -7.6), F.xz(7.6, 7.6), F.xz(-7.6, 7.6)], L_TOP + 0.4, M_COPPER, up=False)
lm.cap(m, [F.xz(-2.9, -2.9), F.xz(2.9, -2.9), F.xz(2.9, 2.9), F.xz(-2.9, 2.9)], 186.2, M_COPPER)
prisms.append(lm.prism_json([F.xz(-6.2, -6.2), F.xz(6.2, -6.2), F.xz(6.2, 6.2), F.xz(-6.2, 6.2)], L_TOP, 186.2, 'Pałac Kultury i Nauki - daszek'))

# iglica: podstawa, kula ~5.2 m, maszt 1.5 -> 0.4 m, mala kula 1.7 m, zwienczenie; wspornik anteny do 237 m
ax, az = F.ox, F.oz
lm.lathe(m, ax, az, [(1.9, 186.2), (1.6, 187.2), (1.0, 187.6)], M_GOLD, segs=12)
sphere = [(math.sin(math.pi * k / 10) * 2.6 + 0.01, 187.4 + 2.6 - 2.6 * math.cos(math.pi * k / 10)) for k in range(11)]
lm.lathe(m, ax, az, sphere, M_BULB, segs=16)
mast = [(0.8, 192.4), (0.75, 196.0), (0.9, 197.0), (0.7, 198.0), (0.6, 208.0), (0.72, 209.0), (0.5, 210.0), (0.42, 220.4)]
lm.lathe(m, ax, az, mast, M_GOLD, segs=10)
small = [(math.sin(math.pi * k / 8) * 0.85 + 0.01, 220.4 + 0.85 - 0.85 * math.cos(math.pi * k / 8)) for k in range(9)]
lm.lathe(m, ax, az, small, M_GOLD, segs=12)
lm.lathe(m, ax, az, [(0.3, 222.1), (0.22, 226.0), (0.05, 230.7)], M_GOLD, segs=8)
lm.lathe(m, ax, az, [(0.1, 230.7), (0.07, 237.0)], M_GOLD, segs=6)
prisms.append(lm.prism_json([F.xz(-0.9, -0.9), F.xz(0.9, -0.9), F.xz(0.9, 0.9), F.xz(-0.9, 0.9)], 186.2, 230.7, 'iglica PKiN'))

# detale (lizeny, gzymsy, attyki) tez ida do raycastow gry: siec sie ich czepia, kamera ich nie przebija
objs = [m.finish(), deco.finish()]

# wykluczenie: caly obrys PKiN (LOD2 bryla bazowa)
outline = base['polys'][0][0]
lm.export('pkin', objs, {'name': 'Pałac Kultury i Nauki', 'exclude': [[round(c, 2) for c in outline]], 'prisms': prisms})

prev = lm.arg('--preview')
if prev:
    lm.preview(prev, F.p(-230, 90, 260), F.p(0, 90, 0), lens=32)
