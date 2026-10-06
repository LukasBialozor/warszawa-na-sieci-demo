# Most Swietokrzyski (2000): pylon w ksztalcie litery A (90 m, zelbet) przy prawym brzegu Wisly i 48 want w ukladzie
# polwachlarzowym, w dwoch plaszczyznach (po 12 want na przeslo glowne 180 m i 12 na przeslo 140 m w kazdej) ->
# public/models/most.glb. Os pomostu z OSM (way 4937006/242607702), pomost 30 m szerokosci na poziomie jezdni gry.
#
# Uruchomienie: blender -b --factory-startup -P blender/most.py -- [--preview PLIK.png]
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import lm_common as lm  # noqa: E402

lm.reset()

A = (1729.0, -984.0)                       # poczatek mostu (lewy brzeg)
L_AX = math.hypot(375.0, -270.0)
DX, DZ = 375.0 / L_AX, -270.0 / L_AX       # os mostu na wschod (Praga)
NX, NZ = -DZ, DX                           # poprzecznie (na poludnie)
S_PYLON = 260.0                            # pylon: w nurcie przy prawym brzegu (woda 58-272 m wzdluz osi)
H_TOP = 90.0
HALF_BASE = 17.0                           # nogi stoja tuz za krawedziami pomostu (30 m)
DECK_EDGE = 14.0                           # zakotwienia want na pomoscie

M_PYLON = lm.material('most_pylon', '#d8d8d2', rough=0.7, emission='#5c5c58', emission_strength=1.0)
M_CABLE = lm.material('most_wanty', '#f2f2ee', rough=0.4, metal=0.6)


def P(s, lat, y):
    """Punkt gry: s wzdluz osi od poczatku mostu, lat poprzecznie, y wysokosc."""
    return (A[0] + DX * s + NX * lat, y, A[1] + DZ * s + NZ * lat)


def tube(m, p0, p1, r, mat, segs=6):
    dx, dy, dz = p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]
    L = math.sqrt(dx * dx + dy * dy + dz * dz) or 1
    d = (dx / L, dy / L, dz / L)
    a = (0, 1, 0) if abs(d[1]) < 0.9 else (1, 0, 0)
    u = (d[1] * a[2] - d[2] * a[1], d[2] * a[0] - d[0] * a[2], d[0] * a[1] - d[1] * a[0])
    ul = math.sqrt(sum(c * c for c in u))
    u = tuple(c / ul for c in u)
    v = (d[1] * u[2] - d[2] * u[1], d[2] * u[0] - d[0] * u[2], d[0] * u[1] - d[1] * u[0])
    r0, r1 = [], []
    for k in range(segs):
        t = 2 * math.pi * k / segs
        o = tuple(r * (math.cos(t) * u[i] + math.sin(t) * v[i]) for i in range(3))
        r0.append(tuple(p0[i] + o[i] for i in range(3)))
        r1.append(tuple(p1[i] + o[i] for i in range(3)))
    for k in range(segs):
        k1 = (k + 1) % segs
        m.poly([r0[k], r0[k1], r1[k1], r1[k]], mat)


def leg_box(m, side, y0, y1, w_along=4.2, w_lat=3.0):
    """Odcinek nogi pylonu: przekroj prostokatny, srodek przesuwa sie do osi wraz z wysokoscia."""
    def corners(y):
        lat = side * HALF_BASE * (1 - y / H_TOP)
        return [P(S_PYLON + su * w_along / 2, lat + sl * w_lat / 2, y) for su, sl in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
    c0, c1 = corners(y0), corners(y1)
    for i in range(4):
        j = (i + 1) % 4
        # naroza ida zgodnie z ruchem wskazowek patrzac z gory - odwrocenie daje normalne na zewnatrz
        m.poly([c1[i], c1[j], c0[j], c0[i]], M_PYLON)


m = lm.Mesh('most')
for side in (-1, 1):
    leg_box(m, side, -3.0, H_TOP - 2.0)
# zwienczenie: blok w szczycie, gdzie nogi sie schodza
top = [P(S_PYLON + su * 2.4, sl * 2.2, 0) for su, sl in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
ring = [(p[0], p[2]) for p in top]
lm.prism(m, ring, H_TOP - 6.0, H_TOP + 2.0, M_PYLON, M_PYLON)
# rygiel pod pomostem
lm.prism(m, [(p[0], p[2]) for p in [P(S_PYLON + su * 2.0, sl * HALF_BASE, 0) for su, sl in ((-1, -1), (1, -1), (1, 1), (-1, 1))]],
         -3.0, -0.6, M_PYLON, M_PYLON)
pylon = m.finish()

# wanty: 12 na przeslo w kazdej plaszczyznie, zakotwienia na pylonie 64-86 m (dalsze wanty wyzej)
c = lm.Mesh('most_wanty')
for side in (-1, 1):
    for k in range(12):
        y = 64.0 + 2.0 * k
        lat_p = side * (HALF_BASE * (1 - y / H_TOP) - 1.2)
        top_pt = P(S_PYLON, lat_p, y)
        c_w = P(S_PYLON - (22.0 + 13.0 * k), side * DECK_EDGE, 1.2)     # przeslo glowne (nad Wisla, na zachod)
        c_e = P(S_PYLON + (18.0 + 10.0 * k), side * DECK_EDGE, 1.2)     # przeslo 140 m (na wschod)
        tube(c, top_pt, c_w, 0.16, M_CABLE)
        tube(c, top_pt, c_e, 0.16, M_CABLE)
cables = c.finish(collide=False)

# kolizje: nogi jako schodki 10 m (mozna sie wspiac), szczyt do stania
prisms = []
for side in (-1, 1):
    for y0 in range(0, 80, 10):
        lat = side * HALF_BASE * (1 - (y0 + 5) / H_TOP)
        ring = [(p[0], p[2]) for p in [P(S_PYLON + su * 2.1, lat + sl * 1.5, 0) for su, sl in ((-1, -1), (1, -1), (1, 1), (-1, 1))]]
        prisms.append(lm.prism_json(ring, float(y0), float(y0 + 10), 'Most Świętokrzyski - pylon'))
prisms.append(lm.prism_json(ring_top := [(p[0], p[2]) for p in top], H_TOP - 6.0, H_TOP + 2.0, 'Most Świętokrzyski - pylon'))
lm.export('most', [pylon, cables], {'name': 'Most Świętokrzyski', 'exclude': [], 'prisms': prisms})

prev = lm.arg('--preview')
if prev:
    lm.preview(prev, P(S_PYLON - 120, -90, 40), P(S_PYLON, 0, 45), lens=30)
