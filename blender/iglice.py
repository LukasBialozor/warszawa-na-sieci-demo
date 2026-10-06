# Iglice i maszty wiezowcow, ktorych OSM nie oddaje -> public/models/iglice.glb
#   Varso Tower: stalowa kratownicowa iglica 234 -> 310 m (trojkat nog ~2.8 m u dolu, zwezajacy sie; obrecze na
#     240, 250, 260, 274 i 294 m wg czesci OSM 984591962-66). Zastepuje uproszczone czesci OSM (875519277/82, 912427955).
#   Centrum LIM (dawny Marriott): maszt antenowy 30 m na dachu 140 m (pasy czerwono-biale, tarcze anten).
#   Kolumna Zygmunta (Plac Zamkowy): zastepuje schodkowe czesci OSM 238615552-65 i 249083887-900.
#
# Uruchomienie: blender -b --factory-startup -P blender/iglice.py -- [--preview PLIK.png]
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import lm_common as lm  # noqa: E402

lm.reset()

M_STEEL = lm.material('iglica_stal', '#e3e6e8', rough=0.35, metal=0.8)
M_RING = lm.material('iglica_obrecz', '#8193b0', rough=0.35, metal=0.7)
M_RED = lm.material('maszt_czerwony', '#b3342b', rough=0.5, metal=0.3)
M_WHITE = lm.material('maszt_bialy', '#eeeeea', rough=0.5, metal=0.3)
M_DARK = lm.material('maszt_ciemny', '#3b3e42', rough=0.5, metal=0.5)


def tube(m, p0, p1, r, mat, segs=6):
    """Rura (graniastoslup) miedzy punktami p0, p1 (x, y, z) o promieniu r."""
    dx, dy, dz = p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]
    L = math.sqrt(dx * dx + dy * dy + dz * dz) or 1
    d = (dx / L, dy / L, dz / L)
    a = (0, 1, 0) if abs(d[1]) < 0.9 else (1, 0, 0)
    u = (d[1] * a[2] - d[2] * a[1], d[2] * a[0] - d[0] * a[2], d[0] * a[1] - d[1] * a[0])
    ul = math.sqrt(sum(c * c for c in u))
    u = tuple(c / ul for c in u)
    v = (d[1] * u[2] - d[2] * u[1], d[2] * u[0] - d[0] * u[2], d[0] * u[1] - d[1] * u[0])
    ring0, ring1 = [], []
    for k in range(segs):
        t = 2 * math.pi * k / segs
        o = tuple(r * (math.cos(t) * u[i] + math.sin(t) * v[i]) for i in range(3))
        ring0.append(tuple(p0[i] + o[i] for i in range(3)))
        ring1.append(tuple(p1[i] + o[i] for i in range(3)))
    for k in range(segs):
        k1 = (k + 1) % segs
        m.poly([ring0[k], ring0[k1], ring1[k1], ring1[k]], mat)


def hoop(m, cx, cz, y, r_out, r_in, h, mat, segs=24):
    """Plaska obrecz (pierscien) o wysokosci h."""
    lm.lathe(m, cx, cz, [(r_in, y), (r_out, y), (r_out, y + h), (r_in, y + h), (r_in, y)], mat, segs=segs, smooth=False,
             cap_top=False)


m = lm.Mesh('iglice')
prisms = []

# ------------------------------------------------------------------ Varso: iglica kratownicowa
VX, VZ = -398.8, 349.6
Y0, Y1, YTOP = 234.0, 262.0, 310.0


def half_side(y):
    if y <= Y1:
        return 1.45 - (1.45 - 0.62) * (y - Y0) / (Y1 - Y0)
    return 0.62 - (0.62 - 0.12) * (y - Y1) / (YTOP - 4 - Y1)


def leg_pt(k, y):
    a = math.radians(90 + 120 * k - 20.4)     # trojkat obrocony zgodnie z osia budynku
    r = half_side(y) / math.cos(math.radians(30))
    return (VX + r * math.cos(a), y, VZ + r * math.sin(a))


# dolna, pelna czesc iglicy (193-234 m, jak czesc OSM 875519282) - zakotwiczenie w koronie budynku
tri = [(leg_pt(k, Y0)[0], leg_pt(k, Y0)[2]) for k in range(3)]
lm.wall_strip(m, lm.orient_out(tri), 193.0, Y0, M_STEEL, win=1.0, floor=1.0)
lm.cap(m, tri, Y0, M_STEEL)
levels = [Y0 + 4.0 * i for i in range(int((YTOP - 4 - Y0) / 4.0) + 1)]
for k in range(3):
    for y0, y1 in zip(levels, levels[1:]):
        tube(m, leg_pt(k, y0), leg_pt(k, y1), 0.16 if y0 < Y1 else 0.1, M_STEEL)
        # stezenia: przekatne na scianach i poziomy
        k1 = (k + 1) % 3
        tube(m, leg_pt(k, y0), leg_pt(k1, y1), 0.06, M_STEEL, segs=4)
        tube(m, leg_pt(k, y1), leg_pt(k1, y1), 0.06, M_STEEL, segs=4)
tube(m, (VX, YTOP - 4.5, VZ), (VX, YTOP, VZ), 0.1, M_STEEL)
lm.lathe(m, VX, VZ, [(0.18, YTOP), (0.01, YTOP + 0.4)], M_WHITE, segs=8)
for y, r in ((240, 2.3), (250, 2.5), (259.6, 2.65), (273.6, 1.6), (293.6, 1.1)):
    hoop(m, VX, VZ, y, r, r - 0.35, 0.4, M_RING)
    for k in range(3):   # ramiona obreczy
        tube(m, leg_pt(k, y + 0.2), (VX + (leg_pt(k, y)[0] - VX) * r / max(0.3, math.hypot(leg_pt(k, y)[0] - VX, leg_pt(k, y)[2] - VZ)), y + 0.2,
                                    VZ + (leg_pt(k, y)[2] - VZ) * r / max(0.3, math.hypot(leg_pt(k, y)[0] - VX, leg_pt(k, y)[2] - VZ))), 0.07, M_STEEL, segs=4)
prisms.append(lm.prism_json([(VX - 1.2, VZ - 1.2), (VX + 1.2, VZ - 1.2), (VX + 1.2, VZ + 1.2), (VX - 1.2, VZ + 1.2)], Y0, YTOP, 'iglica Varso'))
varso_ex = [(VX - 2.6, VZ - 2.6), (VX + 2.6, VZ - 2.6), (VX + 2.6, VZ + 2.6), (VX - 2.6, VZ + 2.6)]

# ------------------------------------------------------------------ Centrum LIM: maszt antenowy
LX, LZ = -81.1, 456.9
B0, B1 = 140.0, 170.0
lm.lathe(m, LX, LZ, [(2.2, B0), (2.2, B0 + 1.2), (1.3, B0 + 1.4), (0.01, B0 + 1.5)], M_DARK, segs=12)
seg = 3.0
y = B0 + 1.2
k = 0
while y < B1 - 0.1:
    y1 = min(B1, y + seg)
    r0 = 0.55 - 0.25 * (y - B0) / (B1 - B0)
    r1 = 0.55 - 0.25 * (y1 - B0) / (B1 - B0)
    lm.lathe(m, LX, LZ, [(r0, y), (r1, y1)], M_RED if k % 2 == 0 else M_WHITE, segs=10, cap_top=False)
    y, k = y1, k + 1
for yd in (149.0, 154.5, 160.0, 165.0):
    lm.lathe(m, LX, LZ, [(0.4, yd), (1.25, yd + 0.1), (1.25, yd + 0.45), (0.4, yd + 0.55)], M_DARK, segs=16, cap_top=False)
lm.lathe(m, LX, LZ, [(0.3, B1), (0.08, B1 + 2.5)], M_RED, segs=8)
prisms.append(lm.prism_json([(LX - 0.6, LZ - 0.6), (LX + 0.6, LZ - 0.6), (LX + 0.6, LZ + 0.6), (LX - 0.6, LZ + 0.6)], B0, B1, 'maszt LIM'))

# ------------------------------------------------------------------ Kolumna Zygmunta (Plac Zamkowy, 1644, 22 m)
# cokol schodkowy, trzon z czerwonego granitu (kopia z 1949 r.), kapitel koryncki, posag krola z krzyzem i szabla
KX, KZ = 503.5, -1719.7   # srodek kolumny wg czesci OSM 238615552-65
M_GRANITE = lm.material('kolumna_granit', '#8e5a52', rough=0.5)
M_STONE = lm.material('kolumna_cokol', '#c9c2b2', rough=0.8)
M_BRONZE = lm.material('kolumna_braz', '#4a4a3c', rough=0.45, metal=0.7)
lm.lathe(m, KX, KZ, [(4.2, 0.0), (4.2, 0.6), (3.5, 0.6), (3.5, 1.2), (2.9, 1.2), (2.9, 1.8)], M_STONE, segs=4,
         smooth=False, phase=0.785)
lm.lathe(m, KX, KZ, [(1.9, 1.8), (1.9, 2.4), (1.6, 2.6), (1.6, 6.0), (1.9, 6.3), (1.9, 6.8)], M_STONE, segs=4,
         smooth=False, phase=0.785)
lm.lathe(m, KX, KZ, [(0.75, 6.8), (0.72, 10.0), (0.62, 17.0), (0.7, 17.3)], M_GRANITE, segs=16)
lm.lathe(m, KX, KZ, [(0.7, 17.3), (1.05, 18.2), (1.1, 18.5)], M_BRONZE, segs=8, smooth=False, phase=0.39)
lm.lathe(m, KX, KZ, [(0.55, 18.5), (0.45, 19.6), (0.32, 20.6), (0.26, 20.9), (0.16, 21.2), (0.01, 21.5)], M_BRONZE, segs=10)
tube(m, (KX, 20.3, KZ), (KX + 0.4, 22.6, KZ - 0.3), 0.06, M_BRONZE, segs=4)        # krzyz - pionowa belka
tube(m, (KX - 0.15, 22.0, KZ - 0.25), (KX + 0.75, 22.1, KZ - 0.15), 0.05, M_BRONZE, segs=4)
tube(m, (KX - 0.3, 19.9, KZ + 0.2), (KX - 0.9, 19.0, KZ + 0.6), 0.05, M_BRONZE, segs=4)  # szabla
prisms.append(lm.prism_json([(KX - 2.9, KZ - 2.9), (KX + 2.9, KZ - 2.9), (KX + 2.9, KZ + 2.9), (KX - 2.9, KZ + 2.9)], 0, 1.8, 'Kolumna Zygmunta'))
prisms.append(lm.prism_json([(KX - 0.8, KZ - 0.8), (KX + 0.8, KZ - 0.8), (KX + 0.8, KZ + 0.8), (KX - 0.8, KZ + 0.8)], 0, 21.5, 'Kolumna Zygmunta'))

obj = m.finish()
kolumna_ex = [(KX - 4.5, KZ - 4.5), (KX + 4.5, KZ - 4.5), (KX + 4.5, KZ + 4.5), (KX - 4.5, KZ + 4.5)]
lm.export('iglice', [obj], {'name': 'iglice', 'exclude': [[round(c, 2) for p in ex for c in p] for ex in (varso_ex, kolumna_ex)],
                            'prisms': prisms})

prev = lm.arg('--preview')
if prev:
    lm.preview(prev, (VX + 25, 285, VZ + 30), (VX, 270, VZ), lens=35)
