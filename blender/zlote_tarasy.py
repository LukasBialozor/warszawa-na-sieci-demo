# Zlote Tarasy - falujacy szklany dach nad atrium (Jerde Partnership, 2007) -> public/models/zlote_tarasy.glb
#
# Dach to jedna ciagla powierzchnia z 4780 trojkatnych tafli (~2.5 x 2.5 x 3 m, biala stalowa siatka, jasnoniebieskie
# szklo), "jak tkanina narzucona na 7 kul": 110 x 100 m, najwyzej 33 m; najnizsza krawedz schodzi do poziomu ulicy
# przy Emilii Plater obok dworca. Bable z OSM (8 kopul: way 239721522-239721529) zlane gladko w fale,
# opadajace do krawedzi atrium (obrys: way 237574573).
# Wysokosc: gladkie maksimum kopul (log-sum-exp), przy krawedzi obnizona do poziomu tarasow galerii.
# Kolizja: graniastoslup z siatka wysokosci (mozna biegac po dachu).
#
# Uruchomienie: blender -b --factory-startup -P blender/zlote_tarasy.py -- [--preview PLIK.png]
import math
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import lm_common as lm  # noqa: E402

lm.reset()

# obrys atrium (OSM way 237574573, uklad gry)
OUTLINE = [(-180.9, 202.4), (-181.9, 195.4), (-186, 193.6), (-183.5, 187), (-182.3, 182.1), (-181.2, 178.2), (-180.3, 175.6),
           (-180, 171.3), (-180.3, 166.6), (-180.9, 160.6), (-183.1, 154.2), (-183.8, 152), (-189.4, 143.5), (-192.5, 139),
           (-195.8, 134.8), (-201.5, 132.1), (-213.2, 129), (-223.2, 127.9), (-232.3, 128), (-240.7, 128.9), (-247.1, 130.3),
           (-254, 133.3), (-260.2, 137.3), (-270.9, 147.1), (-268.7, 149.7), (-270, 150.4), (-278.5, 158.5), (-282.2, 161.1),
           (-285.6, 164.9), (-287.2, 168.5), (-288.4, 173.4), (-288.1, 178.6), (-286.2, 183.4), (-283.1, 187.6), (-283.6, 192.5),
           (-283.7, 198.6), (-282.4, 206.7), (-279.8, 215.1), (-276.5, 220.9), (-271.3, 227.1), (-264.8, 232), (-259.3, 234.7),
           (-254.4, 236.4), (-249.6, 237.3), (-244.6, 237.9), (-245.3, 235.2), (-245.2, 232.4), (-244.5, 229.6), (-243.1, 226.8),
           (-241.1, 224.7), (-238.5, 222.9), (-235.9, 222), (-232.3, 221.4), (-229.2, 222), (-226, 223.1), (-223.7, 224.6),
           (-221.7, 227), (-220.5, 229.2), (-219.5, 231.6), (-219.1, 233.9), (-214.4, 232.3), (-209.8, 230.7), (-208.9, 232),
           (-204.7, 227.7), (-201, 224.9), (-197.8, 223), (-194.1, 221.4), (-190.9, 219.2), (-186.2, 215.7), (-184.1, 214.5),
           (-184, 212.1)]
# kopuly OSM: (srodek x, z, promien, wysokosc szczytu)
DOMES = [(-205.5, 199.2, 24.0, 22), (-204.8, 177.3, 24.0, 35), (-267.5, 167.4, 24.0, 35), (-235.6, 181.1, 24.0, 35),
         (-242.7, 153.1, 24.0, 35), (-233.8, 210.2, 24.0, 22), (-214.0, 153.6, 24.0, 35), (-265.6, 198.2, 24.0, 35)]
H_EDGE = float(lm.arg('--edge', 12.0))     # krawedz dachu (tarasy galerii)
PEAK_SCALE = float(lm.arg('--peak', 0.95))  # skala wysokosci kopul OSM -> najwyzszy punkt ~33 m
LOW_CORNER = (-186.0, 214.0)               # naroze przy Emilii Plater / dworcu, gdzie dach schodzi do ulicy
STEP = 1.25


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


def dist_to_ring(r, x, z):
    best = 1e9
    for i in range(len(r)):
        ax, az = r[i]
        bx, bz = r[(i + 1) % len(r)]
        dx, dz = bx - ax, bz - az
        L2 = dx * dx + dz * dz or 1
        t = max(0, min(1, ((x - ax) * dx + (z - az) * dz) / L2))
        best = min(best, math.hypot(x - ax - dx * t, z - az - dz * t))
    return best


def nearest_on_ring(r, x, z):
    best, bp = 1e9, (x, z)
    for i in range(len(r)):
        ax, az = r[i]
        bx, bz = r[(i + 1) % len(r)]
        dx, dz = bx - ax, bz - az
        L2 = dx * dx + dz * dz or 1
        t = max(0, min(1, ((x - ax) * dx + (z - az) * dz) / L2))
        px, pz = ax + dx * t, az + dz * t
        d = math.hypot(x - px, z - pz)
        if d < best:
            best, bp = d, (px, pz)
    return bp


def edge_height(x, z):
    """Wysokosc krawedzi: tarasy galerii (12 m), przy narozu od Emilii Plater schodzi do ~3 m."""
    d = math.hypot(x - LOW_CORNER[0], z - LOW_CORNER[1])
    t = min(1.0, d / 45.0)
    return 3.0 + (H_EDGE - 3.0) * (t * t * (3 - 2 * t))


def height(x, z):
    k = 0.55
    acc = 0.0
    for cx, cz, R, top in DOMES:
        d = math.hypot(x - cx, z - cz) / R
        f = max(0.0, 1 - d * d) ** 0.55
        h = H_EDGE + (top * PEAK_SCALE - H_EDGE) * f
        acc += math.exp(k * h)
    h = math.log(acc + math.exp(k * H_EDGE)) / k
    # przy krawedzi atrium dach opada do tarasow (ostatnie 9 m)
    he = edge_height(x, z)
    e = dist_to_ring(OUTLINE, x, z)
    t = min(1.0, e / 9.0)
    t = t * t * (3 - 2 * t)
    return he + (h - he) * (0.15 + 0.85 * t) if e < 9 else h


# ------------------------------------------------------------------ tekstura tafli (romby dzielone na trojkaty)
def tex_lattice():
    S = 1024
    y, x = np.mgrid[0:S, 0:S] / S
    n = 4  # romby na kafel
    a = (x + y) * n
    b = (x - y) * n
    line = lambda v, w: np.abs(((v % 1) + 0.5) % 1 - 0.5) < w  # noqa: E731
    frame = line(a, 0.018) | line(b, 0.018) | line(x * n * 2, 0.012)
    rng = np.random.default_rng(5)
    cell = (np.floor(a) * 31 + np.floor(b) * 17 + np.floor(x * n * 2) * 7).astype(int) % 97
    shade = 0.93 + 0.07 * (rng.random(97)[cell])
    img = np.dstack([0.40 * shade, 0.50 * shade, 0.50 * shade])
    img[frame] = (0.80, 0.83, 0.83)
    return lm.save_texture('zt_lattice', img)


def tex_front():
    """Podstawa atrium: bordowy granit z witrynami (parter 0-4.5 m) i pasem pietra; komorka 6 m x 12 m."""
    W, Hh = 256, 512
    yy = (np.arange(Hh)[::-1][:, None] / Hh) * 12.0
    xx = np.arange(W)[None, :] / W * 6.0
    img = np.zeros((Hh, W, 3))
    img[:] = (0.36, 0.22, 0.20)
    shop = (yy > 0.3) & (yy < 4.2) & (xx > 0.4) & (xx < 5.6)
    img[np.broadcast_to(shop, (Hh, W))] = (0.22, 0.27, 0.29)
    band = (yy > 5.5) & (yy < 7.6) & (xx > 0.8) & (xx < 5.2)
    img[np.broadcast_to(band, (Hh, W))] = (0.25, 0.30, 0.33)
    rail = (yy > 8.6) & (yy < 9.6)
    img[np.broadcast_to(rail, (Hh, W))] = (0.55, 0.58, 0.58)
    img += np.random.default_rng(2).normal(0, 0.01, img.shape)
    return lm.save_texture('zt_front', img)


M_GLASS = lm.material('glass_zt', '#ffffff', rough=0.08, metal=0.45, image=tex_lattice())
M_FRONT = lm.material('zt_front', '#ffffff', rough=0.55, metal=0.1, image=tex_front())

# ------------------------------------------------------------------ siatka powierzchni
xs = np.arange(min(p[0] for p in OUTLINE) - STEP, max(p[0] for p in OUTLINE) + STEP * 2, STEP)
zs = np.arange(min(p[1] for p in OUTLINE) - STEP, max(p[1] for p in OUTLINE) + STEP * 2, STEP)
inside = np.array([[in_ring(OUTLINE, x, z) for x in xs] for z in zs])
H = np.array([[height(x, z) if inside[i, j] else H_EDGE for j, x in enumerate(xs)] for i, z in enumerate(zs)])

m = lm.Mesh('zlote_tarasy_dach')
verts = {}


snapped = {}


def P(i, j):
    """Wierzcholek siatki; lezacy poza obrysem przesuwamy na obrys (gladka krawedz zamiast schodkow)."""
    key = (i, j)
    if key not in snapped:
        x, z = xs[j], zs[i]
        if not inside[i, j]:
            x, z = nearest_on_ring(OUTLINE, x, z)
        snapped[key] = (x, height(x, z), z)
    return snapped[key]


def V(i, j):
    key = (i, j)
    if key not in verts:
        verts[key] = m.v(P(i, j))
    return verts[key]


TILE = 12.0
for i in range(len(zs) - 1):
    for j in range(len(xs) - 1):
        # komorka nalezy do dachu, gdy jej srodek jest w obrysie
        cx, cz = (xs[j] + xs[j + 1]) / 2, (zs[i] + zs[i + 1]) / 2
        if not in_ring(OUTLINE, cx, cz):
            continue
        q = [(i, j), (i + 1, j), (i + 1, j + 1), (i, j + 1)]
        # normalna w gore: kolejnosc (z rosnie, potem x rosnie) = du x dv z du = +z, dv = +x -> (0,0,1)x(1,0,0) = (0,1,0)
        uvs = [(P(a, b)[0] / TILE, -P(a, b)[2] / TILE) for a, b in q]
        m.face([V(a, b) for a, b in q], M_GLASS, uvs, smooth=True)

# fartuch: pionowy pas od krawedzi dachu w dol (zaslania szczeliny miedzy dachem a budynkami galerii)
edge_cells = []
for i in range(len(zs) - 1):
    for j in range(len(xs) - 1):
        cx, cz = (xs[j] + xs[j + 1]) / 2, (zs[i] + zs[i + 1]) / 2
        if not in_ring(OUTLINE, cx, cz):
            continue
        for (di, dj, e0, e1) in ((-1, 0, (i, j), (i, j + 1)), (1, 0, (i + 1, j + 1), (i + 1, j)),
                                 (0, -1, (i + 1, j), (i, j)), (0, 1, (i, j + 1), (i + 1, j + 1))):
            ni, nj = i + di, j + dj
            ncx, ncz = (xs[nj] + xs[nj + 1]) / 2, (zs[ni] + zs[ni + 1]) / 2
            if in_ring(OUTLINE, ncx, ncz):
                continue
            (ai, aj), (bi, bj) = e0, e1
            A = P(ai, aj)
            B = P(bi, bj)
            low = 0.0
            quad = [A, (A[0], low, A[2]), (B[0], low, B[2]), B]
            # normalna (A_dol - A) x (B - A) ma skladowe (x, z) proporcjonalne do (-h*dz, h*dx); ma wskazywac na zewnatrz
            ex, ez = B[0] - A[0], B[2] - A[2]
            if -ez * dj + ex * di < 0:
                quad = quad[::-1]
            L = math.hypot(ex, ez)
            if quad[0] is A:
                uv = [(0, A[1] / 12), (0, 0), (L / 6, 0), (L / 6, B[1] / 12)]
            else:
                uv = [(L / 6, B[1] / 12), (L / 6, 0), (0, 0), (0, A[1] / 12)]
            m.poly(quad, M_FRONT, uv)
obj = m.finish()

# ------------------------------------------------------------------ opis dla gry
# siatka wysokosci dla kolizji (co 2.5 m)
d = 2.5
hx = np.arange(xs[0], xs[-1] + d, d)
hz = np.arange(zs[0], zs[-1] + d, d)
hf = [round(height(x, z) if in_ring(OUTLINE, x, z) else H_EDGE, 2) for z in hz for x in hx]
top = float(H.max())
prism = lm.prism_json(OUTLINE, 0.0, top, 'Złote Tarasy - dach', eave=H_EDGE,
                      hf={'x0': round(float(hx[0]), 2), 'z0': round(float(hz[0]), 2), 'd': d, 'nx': len(hx), 'nz': len(hz), 'h': hf})
# wykluczenie: tylko kopuly OSM i obrys atrium (otoczka srodkow kopul + margines), nie budynki galerii
cxs = [c[0] for c in DOMES]
czs = [c[1] for c in DOMES]
hull = [(min(cxs) - 12, min(czs) - 12), (max(cxs) + 12, min(czs) - 12), (max(cxs) + 12, max(czs) + 12), (min(cxs) - 12, max(czs) + 12)]
lm.export('zlote_tarasy', [obj], {'name': 'Złote Tarasy', 'exclude': [[round(c, 2) for p in hull for c in p]], 'prisms': [prism]})
print('szczyt dachu', round(top, 1), 'm')

prev = lm.arg('--preview')
if prev:
    lm.preview(prev, (-150, 60, 280), (-235, 20, 180), lens=35)
