# Zlota 44 ("Zagiel", Daniel Libeskind, 2017) -> public/models/zlota44.glb
#
# Bryly wprost z czesci budynku w OSM (building:part, wysokosci i dachy jednospadowe), wspolrzedne gry:
#   rdzen 239175870: 0-180 m, dach plaski;
#   skrzydlo 982221142: pas wzdluz wsch. i pd. elewacji, 95 m -> skosny wierzch 134-192 m (spadek na 295 st.),
#     szczyt w narozu pd.-wsch.;
#   faldy 982221143 (pd., 8 -> 99 m, spadek na 161 st.) oraz 982221144 i 982799287 (wsch., 36 -> 99 m, spadek na 78 st.):
#     skosne przeszklone plaszczyzny od rdzenia na wysokosci 99 m w dol do zewnetrznej linii skrzydla;
#   podium 239175869 (0-32 m, zielony dach) i 979893146 (0-28 m).
# Elewacja (zdjecia): biale poziome pasy miedzy pietrami i okna tasmowe o roznej dlugosci; faldy i szczyt rdzenia
# (szklane "pudelko" nad nizsza czescia skrzydla) przeszklone; podium w bialo-szklane pasy, parter za skosnymi slupami.
#
# Uruchomienie: blender -b --factory-startup -P blender/zlota44.py -- [--preview PLIK.png]
import math
import os
import sys

import numpy as np
from mathutils import Vector, geometry

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import lm_common as lm  # noqa: E402

lm.reset()

OUTLINE = [(-254.7, 89.7), (-261.6, 92.1), (-274.1, 55.6), (-273.3, 55.3), (-268.6, 53.7), (-228.6, 39.5), (-222.6, 37.4),
           (-220.6, 36.7), (-220.6, 37.0), (-219.1, 43.8), (-218.3, 47.1), (-217.8, 49.7), (-212.2, 74.9), (-218.6, 77.1),
           (-232.5, 82.0), (-231.5, 85.5), (-233.9, 85.6), (-237.3, 86.0), (-240.5, 86.8), (-246.6, 88.8), (-253.5, 92.0),
           (-253.7, 91.1), (-254.3, 91.3)]
CORE = [(-242.5, 48.8), (-236.0, 78.7), (-235.1, 82.9), (-239.0, 84.2), (-254.1, 89.5), (-254.7, 89.7), (-261.6, 92.1),
        (-274.1, 55.6), (-253.8, 51.3)]
CORE_TOP = 180.0
WING = [(-239.6, 45.6), (-243.0, 46.6), (-253.7, 50.0), (-253.8, 51.3), (-242.5, 48.8), (-236.0, 78.7), (-239.0, 84.2),
        (-254.1, 89.5), (-254.7, 89.7), (-254.3, 91.3), (-253.7, 91.1), (-241.7, 86.9), (-239.1, 86.3), (-237.3, 86.0),
        (-233.9, 85.6), (-231.5, 85.5), (-232.5, 82.0), (-233.6, 78.2), (-235.1, 72.9), (-236.7, 66.2), (-238.0, 59.4),
        (-239.0, 52.5), (-239.4, 48.2)]
FOLD_S = [(-235.1, 82.9), (-234.6, 85.3), (-237.3, 86.0), (-240.5, 86.8), (-246.6, 88.8), (-253.5, 92.0), (-253.7, 91.1),
          (-254.1, 89.5), (-239.0, 84.2)]
FOLD_E = [(-239.4, 48.2), (-239.0, 52.5), (-238.0, 59.4), (-236.7, 66.2), (-235.1, 72.9), (-233.6, 78.2), (-236.0, 78.7),
          (-242.5, 48.8)]
FOLD_NE = [(-242.5, 48.8), (-253.8, 51.3), (-253.7, 50.0), (-243.0, 46.6), (-239.6, 45.6), (-239.4, 48.2)]
POD_A = [(-236.5, 43.1), (-218.6, 77.1), (-232.5, 82.0), (-235.1, 82.9), (-236.0, 78.7), (-242.5, 48.8), (-243.0, 46.6)]
POD_B = [(-220.6, 36.7), (-220.6, 37.0), (-219.1, 43.8), (-218.3, 47.1), (-217.8, 49.7), (-212.2, 74.9), (-218.6, 77.1),
         (-236.5, 43.1), (-243.0, 46.6), (-253.7, 50.0), (-253.8, 51.3), (-274.1, 55.6), (-273.3, 55.3), (-268.6, 53.7),
         (-228.6, 39.5), (-222.6, 37.4)]

FLOOR = 3.5        # wysokosc kondygnacji
PANEL = 1.5        # szerokosc modulu fasady
TILE_U, TILE_V = 8, 8   # kafel tekstury: 8 modulow x 8 pieter


def skillion(ring, top, roof_h, bearing):
    """Wysokosc dachu jednospadowego OSM: najnizej (top - roof_h) w kierunku bearing (stopnie od pn.), najwyzej naprzeciw."""
    dx, dz = math.sin(math.radians(bearing)), -math.cos(math.radians(bearing))   # kierunek spadku w ukladzie gry
    s = [-(x * dx + z * dz) for x, z in ring]
    s0, s1 = min(s), max(s)
    return lambda x, z: top - roof_h * (s1 - (-(x * dx + z * dz))) / (s1 - s0)


def on_ring(p, ring, tol=0.35):
    for i in range(len(ring)):
        (ax, az), (bx, bz) = ring[i], ring[(i + 1) % len(ring)]
        vx, vz = bx - ax, bz - az
        L2 = vx * vx + vz * vz or 1
        t = max(0.0, min(1.0, ((p[0] - ax) * vx + (p[1] - az) * vz) / L2))
        if math.hypot(p[0] - ax - vx * t, p[1] - az - vz * t) < tol:
            return True
    return False


# ------------------------------------------------------------------ tekstury
rng = np.random.default_rng(44)


def facade_texture():
    """Biale pasy stropow + okna tasmowe przerywane bialymi plycinami (rozne dlugosci okien), jak na zdjeciach.
    Druga tekstura: zapalone okna mieszkan (emisja, w grze wlaczana noca)."""
    pw, fh = 48, 112                     # px na modul (1.5 m) i na pietro (3.5 m)
    W, H = TILE_U * pw, TILE_V * fh
    img = np.ones((H, W, 3)) * np.array([0.93, 0.94, 0.94])
    lit = np.zeros((H, W, 3))
    band = int(fh * 0.34)                # bialy pas stropu ~1.2 m
    for f in range(TILE_V):
        y0 = f * fh + band
        # okna: ciagi modulow szyb o losowej dlugosci przerywane bialymi plycinami
        u = 0
        while u < TILE_U:
            n = int(rng.integers(1, 6))
            glass = rng.random() < 0.7
            on = rng.random() < 0.3
            warm = np.array([1.0, 0.78, 0.5]) if rng.random() < 0.8 else np.array([0.85, 0.9, 1.0])
            for k in range(u, min(TILE_U, u + n)):
                if not glass:
                    continue
                x0 = k * pw
                g = np.linspace(1.2, 0.82, fh - band)[:, None, None]
                tint = np.array([0.36, 0.44, 0.5]) + rng.random() * 0.06
                img[y0:(f + 1) * fh, x0:x0 + pw] = tint * g
                img[y0:(f + 1) * fh, x0:x0 + 2] = (0.8, 0.82, 0.83)        # slupek
                if on:
                    lit[y0 + 4:(f + 1) * fh - 2, x0 + 3:x0 + pw - 1] = warm * (0.7 + rng.random() * 0.3)
            u += n
        img[f * fh + band - 3:f * fh + band] = (0.74, 0.76, 0.77)           # cien pod pasem
    return lm.save_texture('z44_facade', img), lm.save_texture('z44_lights', lit)


def glass_texture():
    """Przeszklenie (faldy, szczyt rdzenia): ciemne szyby, jasne slupki co 1.5 m i rygle co pietro."""
    pw, fh = 32, 74
    W, H = 4 * pw, 4 * fh
    img = np.zeros((H, W, 3))
    for f in range(4):
        for k in range(4):
            t = np.array([0.24, 0.32, 0.36]) * (0.9 + rng.random() * 0.25)
            img[f * fh:(f + 1) * fh, k * pw:(k + 1) * pw] = t * np.linspace(1.12, 0.88, fh)[:, None, None]
        img[f * fh:f * fh + 3] = (0.85, 0.87, 0.88)
    img[:, ::pw] = (0.85, 0.87, 0.88)
    img[:, 1::pw] = (0.85, 0.87, 0.88)
    return lm.save_texture('z44_glass', img)


def podium_texture():
    """Podium: biale pasy i szerokie okna (rytm 3.5 m)."""
    pw, fh = 48, 112
    W, H = 8 * pw, 4 * fh
    img = np.ones((H, W, 3)) * np.array([0.92, 0.93, 0.93])
    band = int(fh * 0.42)
    for f in range(4):
        for k in range(8):
            if rng.random() < 0.85:
                x0 = k * pw
                img[f * fh + band:(f + 1) * fh, x0:x0 + pw] = np.array([0.2, 0.26, 0.3]) * np.linspace(1.1, 0.9, fh - band)[:, None, None]
                img[f * fh + band:(f + 1) * fh, x0:x0 + 2] = (0.8, 0.82, 0.83)
    return lm.save_texture('z44_podium', img)


FACADE_IMG, LIGHTS_IMG = facade_texture()
M_FACADE = lm.material('z44_facade', '#ffffff', rough=0.45, metal=0.15, image=FACADE_IMG)
# zapalone okna jako mapa emisji (w grze mnozona przez pore dnia)
_nt = M_FACADE.node_tree
_lt = _nt.nodes.new('ShaderNodeTexImage')
_lt.image = lm.bpy.data.images.load(LIGHTS_IMG, check_existing=True)
_nt.links.new(_lt.outputs['Color'], _nt.nodes['Principled BSDF'].inputs['Emission Color'])
_nt.nodes['Principled BSDF'].inputs['Emission Strength'].default_value = 1.0
M_GLASS = lm.material('glass_z44', '#ffffff', rough=0.1, metal=0.5, image=glass_texture())
M_PODIUM = lm.material('z44_podium', '#ffffff', rough=0.5, metal=0.1, image=podium_texture())
M_WHITE = lm.material('z44_white', '#eceeee', rough=0.5, metal=0.1)
M_ROOF = lm.material('z44_roof', '#8c8f8c', rough=0.9)
M_GREEN = lm.material('z44_green', '#5f7048', rough=0.95)
M_GROUND = lm.material('glass_z44_ground', '#2a3236', rough=0.15, metal=0.4)

m = lm.Mesh('zlota44')
TU, TV = TILE_U * PANEL, TILE_V * FLOOR   # rozmiar kafla fasady [m]


def walls(ring, y0, top_fn, mat, skip=None, min_top=None, tile=(TU, TV)):
    """Sciany wzdluz obrysu od y0 do top_fn(x, z); krawedzie wspolne z innymi brylami (skip) tylko powyzej min_top."""
    r = lm.orient_out(ring)
    s = 0.0
    for i in range(len(r)):
        a, b = r[i], r[(i + 1) % len(r)]
        L = math.hypot(b[0] - a[0], b[1] - a[1])
        if L < 1e-3:
            continue
        ta, tb = top_fn(*a), top_fn(*b)
        lo = y0
        if skip and on_ring(a, skip) and on_ring(b, skip):
            if min_top is None or max(ta, tb) <= min_top + 0.01:
                s += L
                continue
            lo = min_top
        if ta - lo > 0.01 or tb - lo > 0.01:
            ta2, tb2 = max(ta, lo), max(tb, lo)
            m.poly([(a[0], lo, a[1]), (b[0], lo, b[1]), (b[0], tb2, b[1]), (a[0], ta2, a[1])], mat,
                   [(s / tile[0], lo / tile[1]), ((s + L) / tile[0], lo / tile[1]), ((s + L) / tile[0], tb2 / tile[1]),
                    (s / tile[0], ta2 / tile[1])])
        s += L


def surface(ring, top_fn, mat, up=True, uv=None):
    """Plaski (w ogolnosci pochylony) wielokat na wysokosciach top_fn - triangulacja jak w pkin.py."""
    loops = [[Vector((x, z, 0)) for x, z in ring]]
    for tri in geometry.tessellate_polygon(loops):
        P = [(ring[i][0], top_fn(*ring[i]), ring[i][1]) for i in tri]
        (x0, _, z0), (x1, _, z1), (x2, _, z2) = P
        if ((x1 - x0) * (z2 - z0) - (z1 - z0) * (x2 - x0) > 0) == up:
            P = [P[0], P[2], P[1]]
        m.poly(P, mat, [uv(p) for p in P] if uv else [(p[0] / 12, p[2] / 12) for p in P])


flat = lambda h: (lambda x, z: h)  # noqa: E731

# rdzen: fasada do 162 m, wyzej szklane "pudelko" (widoczne nad nizsza czescia skrzydla)
BOX = 162.0
walls(CORE, 0.0, flat(BOX), M_FACADE)
walls(CORE, BOX, flat(CORE_TOP), M_GLASS, tile=(6.0, 14.0))
surface(CORE, flat(CORE_TOP), M_ROOF)

# skrzydlo: zewnetrzne sciany od 95 m do skosnego wierzchu, od strony rdzenia tylko ponad jego dachem
wing_top = skillion(WING, 192.0, 58.0, 295)
walls(WING, 95.0, wing_top, M_FACADE, skip=CORE, min_top=CORE_TOP)
surface(WING, wing_top, M_WHITE)
surface(WING, flat(95.0), M_GLASS, up=False)

# faldy: skosne przeszklone plaszczyzny od zewnetrznej linii (dol) do rdzenia na 99 m
for ring, base, bearing in ((FOLD_S, 8.0, 161), (FOLD_E, 36.0, 78), (FOLD_NE, 36.0, 78)):
    f = skillion(ring, 99.0, 99.0 - base, bearing)
    walls(ring, base, f, M_GLASS, skip=CORE, tile=(6.0, 14.0))
    dx, dz = math.sin(math.radians(bearing)), -math.cos(math.radians(bearing))
    # UV: u wzdluz poziomej krawedzi falda (prostopadle do spadku), v = wysokosc
    surface(ring, f, M_GLASS, uv=lambda p, dx=dx, dz=dz: ((p[0] * -dz + p[2] * dx) / 6.0, p[1] / 14.0))

# podium: parter (0-6 m) ciemne przeszklenie, wyzej bialo-szklane pasy; dach zielony (A) i techniczny (B)
for ring, h, roof in ((POD_A, 32.0, M_GREEN), (POD_B, 28.0, M_ROOF)):
    walls(ring, 0.0, flat(6.0), M_GROUND, skip=CORE, tile=(6.0, 6.0))
    walls(ring, 6.0, flat(h), M_PODIUM, skip=CORE, tile=(12.0, 14.0))
    surface(ring, flat(h), roof)


def strut(p0, p1, w, mat):
    """Slup o przekroju kwadratowym w x w miedzy punktami p0 i p1 (x, y, z)."""
    d = Vector(p1) - Vector(p0)
    a = d.cross(Vector((0, 1, 0))) if abs(d.normalized().y) < 0.99 else Vector((1, 0, 0))
    a = a.normalized() * (w / 2)
    b = d.cross(a).normalized() * (w / 2)
    c0 = [Vector(p0) + a + b, Vector(p0) - a + b, Vector(p0) - a - b, Vector(p0) + a - b]
    c1 = [v + d for v in c0]
    for i in range(4):
        j = (i + 1) % 4
        m.poly([tuple(c0[i]), tuple(c0[j]), tuple(c1[j]), tuple(c1[i])], mat)


# skosne slupy (V) przed przeszklonym parterem wzdluz ulic: krawedzie podium o dlugosci > 10 m, nie przy rdzeniu
for ring in (POD_A, POD_B):
    r = lm.orient_out(ring)
    for i in range(len(r)):
        a, b = r[i], r[(i + 1) % len(r)]
        L = math.hypot(b[0] - a[0], b[1] - a[1])
        if L < 10 or any(on_ring(a, o) and on_ring(b, o) for o in (CORE, WING)) or                 (on_ring(a, POD_A) and on_ring(b, POD_A) and ring is POD_B):
            continue
        ux, uz = (b[0] - a[0]) / L, (b[1] - a[1]) / L
        nx, nz = uz, -ux                       # na zewnatrz (obieg orient_out)
        k = int(L // 7.0)
        for j in range(1, k + 1):
            t = j * L / (k + 1)
            cx, cz = a[0] + ux * t + nx * 0.6, a[1] + uz * t + nz * 0.6
            for sgn in (-1, 1):
                strut((cx, 0.0, cz), (cx + ux * sgn * 1.8, 6.0, cz + uz * sgn * 1.8), 0.45, M_WHITE)

obj = m.finish()

# ------------------------------------------------------------------ opis dla gry
def hf_of(ring, fn, d=1.0):
    xs, zs = [p[0] for p in ring], [p[1] for p in ring]
    x0, z0 = math.floor(min(xs)) - 1, math.floor(min(zs)) - 1
    nx, nz = int((max(xs) - x0) / d) + 3, int((max(zs) - z0) / d) + 3
    return {'x0': x0, 'z0': z0, 'd': d, 'nx': nx, 'nz': nz,
            'h': [round(fn(x0 + i * d, z0 + j * d), 2) for j in range(nz) for i in range(nx)]}


# dachy jednospadowe: eave = najnizszy punkt wierzchu (od tej wysokosci gra liczy dach z siatki hf)
prisms = [lm.prism_json(CORE, 0.0, CORE_TOP, 'Złota 44'),
          lm.prism_json(WING, 95.0, 192.0, 'Złota 44', hf=hf_of(WING, wing_top), eave=134.0),
          lm.prism_json(POD_A, 0.0, 32.0, 'Złota 44 - podium'),
          lm.prism_json(POD_B, 0.0, 28.0, 'Złota 44 - podium')]
for ring, base, bearing in ((FOLD_S, 8.0, 161), (FOLD_E, 36.0, 78), (FOLD_NE, 36.0, 78)):
    prisms.append(lm.prism_json(ring, base, 99.0, 'Złota 44', hf=hf_of(ring, skillion(ring, 99.0, 99.0 - base, bearing), 0.5),
                                eave=base))
lm.export('zlota44', [obj], {'name': 'Złota 44', 'exclude': [[round(c, 2) for p in OUTLINE for c in p]], 'prisms': prisms})

prev = lm.arg('--preview')
if prev:
    lm.preview(prev, (-60, 120, 160), (-248, 120, 70), lens=30)
