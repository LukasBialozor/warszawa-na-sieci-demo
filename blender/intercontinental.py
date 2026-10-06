# Hotel InterContinental Warszawa (ul. Emilii Plater 49, 2003) -> public/models/intercontinental.glb
#
# Bryly z czesci budynku w OSM (way 30611691 i czesci 2349159xx, 239168064), wspolrzedne gry, kondygnacja ~3.42 m:
#   parter i lobby: caly obrys do 5. kondygnacji;
#   kondygnacje 5-21: blok zachodni (szklo na zewnatrz, kamien od strony przeswitu) i waska kamienna "noga" w narozu
#     pn.-wsch.; reszta to PRZESWIT otwarty na wschod (zostawiony dla swiatla sasiedniego bloku mieszkalnego);
#   kondygnacje 21-45: pelny blok szklany, pod nim kasetonowy strop nad przeswitem, ciemne pasy technicznych pieter.
# Elewacja (zdjecia): jasne niebieskoszare szklo w siatce slupkow, kamien (jasnoszary granit) z malymi oknami.
#
# Uruchomienie: blender -b --factory-startup -P blender/intercontinental.py -- [--preview PLIK.png]
import math
import os
import sys

import bpy
import numpy as np
from mathutils import Vector, geometry

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import lm_common as lm  # noqa: E402

lm.reset()

LV = 154.0 / 45                      # wysokosc kondygnacji
H_PODIUM = 5 * LV                    # ~17.1 m
H_VOID = 21 * LV                     # ~71.9 m - spod bloku nad przeswitem
H_ROOF = 154.0                       # dach bryly szklanej
H_TOP = 164.0                        # attyka/ekran na dachu (wysokosc z OSM)

OUTLINE = [(-227.4, -88.0), (-267.7, -73.9), (-254.0, -34.2), (-220.1, -46.6), (-213.9, -48.8), (-216.3, -55.7)]
TOWER = [(-258.5, -74.8), (-247.6, -45.1), (-219.5, -55.5), (-219.2, -55.6), (-219.8, -56.1), (-217.6, -56.8), (-226.5, -81.0),
         (-228.4, -85.9), (-232.8, -84.2), (-243.8, -80.2), (-244.3, -80.0)]
WEST = [(-258.5, -74.8), (-247.6, -45.1), (-219.5, -55.5), (-239.0, -74.5), (-244.3, -80.0)]   # kond. 5-21
LEG = [(-232.8, -84.2), (-226.5, -81.0), (-228.4, -85.9)]                                       # noga pn.-wsch.

rng = np.random.default_rng(49)


# ------------------------------------------------------------------ tekstury
def glass_textures():
    """Sciana kurtynowa: tafle 1.5 m x kondygnacja, jasne slupki, ciemniejszy pas stropu; okna pokoi noca."""
    pw, fh, nu, nv = 40, 92, 8, 8
    W, H = nu * pw, nv * fh
    img = np.zeros((H, W, 3))
    lit = np.zeros((H, W, 3))
    for f in range(nv):
        for k in range(nu):
            t = np.array([0.40, 0.50, 0.58]) * (0.92 + rng.random() * 0.12)
            y0, y1 = f * fh, (f + 1) * fh
            img[y0:y1, k * pw:(k + 1) * pw] = t * np.linspace(1.12, 0.88, fh)[:, None, None]
            img[y1 - 14:y1, k * pw:(k + 1) * pw] = t * 0.72                     # pas stropu
            if rng.random() < 0.28:
                warm = np.array([1.0, 0.8, 0.55]) if rng.random() < 0.85 else np.array([0.85, 0.9, 1.0])
                lit[y0 + 3:y1 - 15, k * pw + 3:(k + 1) * pw - 2] = warm * (0.6 + rng.random() * 0.4)
        img[f * fh:f * fh + 2] = (0.86, 0.88, 0.9)
    img[:, ::pw] = (0.86, 0.88, 0.9)
    img[:, 1::pw] = (0.86, 0.88, 0.9)
    return lm.save_texture('ic_glass', img), lm.save_texture('ic_glass_lit', lit)


def stone_texture():
    """Jasnoszary granit w plytach z malymi oknami (pojedyncze, rozrzucone jak na zdjeciu)."""
    pw, fh, nu, nv = 48, 92, 4, 8           # komorka: 2 m x kondygnacja
    W, H = nu * pw, nv * fh
    img = np.ones((H, W, 3)) * np.array([0.8, 0.8, 0.77])
    img += (rng.random((H, W, 1)) - 0.5) * 0.04
    img[::23] *= 0.9                         # spoiny poziome
    img[:, ::24] *= 0.92                     # spoiny pionowe
    for f in range(nv):
        for k in range(nu):
            if rng.random() < 0.45:
                x0, y0 = k * pw + 16, f * fh + 30
                img[y0:y0 + 30, x0:x0 + 16] = (0.18, 0.22, 0.26)
    return lm.save_texture('ic_stone', np.clip(img, 0, 1))


def soffit_texture():
    """Kasetonowy strop nad przeswitem."""
    S, n = 128, 4
    img = np.ones((S, S, 3)) * np.array([0.82, 0.8, 0.76])
    c = S // n
    for i in range(n):
        img[i * c:i * c + 4] = (0.55, 0.54, 0.52)
        img[:, i * c:i * c + 4] = (0.55, 0.54, 0.52)
    return lm.save_texture('ic_soffit', img)


def lobby_texture():
    """Parter: wysokie przeszklenie (2 kondygnacje) w ciemnych ramach."""
    pw, fh = 40, 160
    W, H = 4 * pw, fh
    img = np.zeros((H, W, 3)) + np.array([0.2, 0.25, 0.28]) * np.linspace(1.2, 0.8, H)[:, None, None]
    img[:, ::pw] = (0.32, 0.34, 0.36)
    img[:, 1::pw] = (0.32, 0.34, 0.36)
    img[::fh // 2] = (0.32, 0.34, 0.36)
    lit = np.zeros((H, W, 3)) + np.array([1.0, 0.85, 0.6]) * 0.6
    lit[:, ::pw] = 0
    return lm.save_texture('ic_lobby', img), lm.save_texture('ic_lobby_lit', lit)


def with_lights(mat, path, strength=1.0):
    nt = mat.node_tree
    t = nt.nodes.new('ShaderNodeTexImage')
    t.image = bpy.data.images.load(path, check_existing=True)
    nt.links.new(t.outputs['Color'], nt.nodes['Principled BSDF'].inputs['Emission Color'])
    nt.nodes['Principled BSDF'].inputs['Emission Strength'].default_value = strength
    return mat


GLASS_IMG, GLASS_LIT = glass_textures()
LOBBY_IMG, LOBBY_LIT = lobby_texture()
M_GLASS = with_lights(lm.material('glass_ic', '#ffffff', rough=0.12, metal=0.45, image=GLASS_IMG), GLASS_LIT)
M_LOBBY = with_lights(lm.material('glass_ic_lobby', '#ffffff', rough=0.15, metal=0.3, image=LOBBY_IMG), LOBBY_LIT)
M_STONE = lm.material('ic_stone', '#ffffff', rough=0.7, image=stone_texture())
M_SOFFIT = lm.material('ic_soffit', '#ffffff', rough=0.8, image=soffit_texture())
M_BAND = lm.material('glass_ic_band', '#262d33', rough=0.15, metal=0.5)
M_ROOF = lm.material('ic_roof', '#a5a28c', rough=0.9)

m = lm.Mesh('intercontinental')
GT = (12.0, 8 * LV)   # kafel tekstury szkla [m]


def on_ring(p, ring, tol=0.35):
    for i in range(len(ring)):
        (ax, az), (bx, bz) = ring[i], ring[(i + 1) % len(ring)]
        vx, vz = bx - ax, bz - az
        L2 = vx * vx + vz * vz or 1
        t = max(0.0, min(1.0, ((p[0] - ax) * vx + (p[1] - az) * vz) / L2))
        if math.hypot(p[0] - ax - vx * t, p[1] - az - vz * t) < tol:
            return True
    return False


def walls(ring, y0, y1, mat_fn, tile):
    """Sciany obrysu; mat_fn(a, b) wybiera material (lub None = bez sciany) dla krawedzi a->b."""
    r = lm.orient_out(ring)
    s = 0.0
    for i in range(len(r)):
        a, b = r[i], r[(i + 1) % len(r)]
        L = math.hypot(b[0] - a[0], b[1] - a[1])
        if L < 1e-3:
            continue
        mat = mat_fn(a, b)
        if mat:
            tu, tv = tile(mat)
            m.poly([(a[0], y0, a[1]), (b[0], y0, b[1]), (b[0], y1, b[1]), (a[0], y1, a[1])], mat,
                   [(s / tu, y0 / tv), ((s + L) / tu, y0 / tv), ((s + L) / tu, y1 / tv), (s / tu, y1 / tv)])
        s += L


def tile(mat):
    return {M_GLASS: GT, M_STONE: (8.0, 8 * LV), M_LOBBY: (6.0, 2 * LV), M_BAND: GT}.get(mat, GT)


def flat(ring, y, mat, up=True, scale=8.0):
    loops = [[Vector((x, z, 0)) for x, z in ring]]
    for tri in geometry.tessellate_polygon(loops):
        P = [(ring[i][0], y, ring[i][1]) for i in tri]
        (x0, _, z0), (x1, _, z1), (x2, _, z2) = P
        if ((x1 - x0) * (z2 - z0) - (z1 - z0) * (x2 - x0) > 0) == up:
            P = [P[0], P[2], P[1]]
        m.poly(P, mat, [(p[0] / scale, p[2] / scale) for p in P])


# parter / lobby
walls(OUTLINE, 0.0, H_PODIUM, lambda a, b: M_LOBBY, tile)
flat(OUTLINE, H_PODIUM, M_ROOF)

# kondygnacje 5-21: blok zachodni - od strony przeswitu (skosna sciana) kamien, reszta szklo; noga - kamien
DIAG = [(-219.5, -55.5), (-239.0, -74.5), (-244.3, -80.0)]
walls(WEST, H_PODIUM, H_VOID, lambda a, b: M_STONE if on_ring(a, [DIAG[0], DIAG[1], DIAG[2], DIAG[1]]) and
      on_ring(b, [DIAG[0], DIAG[1], DIAG[2], DIAG[1]]) else M_GLASS, tile)
walls(LEG, H_PODIUM, H_VOID, lambda a, b: M_STONE, tile)

# blok szklany nad przeswitem; ciemny pas na dole bloku i dwa pod dachem (pietra techniczne / basen)
# szklo do samej gory (164 m: najwyzsze pietra z basenem i ekran dachu w tej samej scianie kurtynowej)
for y0, y1, mat in ((H_VOID, H_VOID + LV, M_BAND), (H_VOID + LV, 146.0, M_GLASS), (146.0, 149.4, M_BAND),
                    (149.4, H_TOP, M_GLASS)):
    walls(TOWER, y0, y1, lambda a, b, mat=mat: mat, tile)
flat(TOWER, H_VOID, M_SOFFIT, up=False, scale=6.0)          # strop nad przeswitem (widoczny od dolu)
flat(TOWER, H_TOP, M_ROOF)

obj = m.finish()

# ------------------------------------------------------------------ opis dla gry
prisms = [lm.prism_json(OUTLINE, 0.0, H_PODIUM, 'InterContinental'),
          lm.prism_json(WEST, H_PODIUM, H_VOID, 'InterContinental'),
          lm.prism_json(LEG, H_PODIUM, H_VOID, 'InterContinental'),
          lm.prism_json(TOWER, H_VOID, H_TOP, 'InterContinental')]
lm.export('intercontinental', [obj], {'name': 'InterContinental',
                                      'exclude': [[round(c, 2) for p in OUTLINE for c in p]], 'prisms': prisms})

prev = lm.arg('--preview')
if prev:
    lm.preview(prev, (-120, 40, 40), (-238, 80, -62), lens=30)
