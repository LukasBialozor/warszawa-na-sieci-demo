# Dworzec Centralny (Warszawa Centralna, hala glowna; A. Romanowicz, P. Szymaniak, 1975) -> public/models/centralna.glb
#
# "Wielki baldachim na dwoch rzedach smuklych zelbetowych slupow" (28 slupow, 2 rzedy po 14 co 10 m, 42 m miedzy
# rzedami). Dach plaski od gory (140 x 86 m, ~20.5 m), a jego przekroj poprzeczny to "trzy krzywe": luk nad hala
# miedzy rzedami i dwa skrzydla okapow wznoszace sie ku cienkim krawedziom (wspornik ~22 m). Glowice slupow
# ("kielichy") rozszerzaja sie w podsufitke - najnizsza wlasnie nad slupami. Z konca (od Emilii Plater) widac fale:
# czolo dachu grube nad rzedami slupow, cienkie w narozach. Dlugie boki hali: przeszklone sciany; konce: ciemne
# segmenty z pasem okien, napisem WARSZAWA CENTRALNA i przeszkleniem pod lukiem.
# Zrodla: OSM (dach way 209689548, hala 226156055, konce 226156058/59, slupy 226156027-54), LOD2 GUGiK (wierzch
# dachu 20.5-21.5 m), opisy (Wikipedia, rejestr zabytkow: "plaski dach oparty na trzech krzywiznach").
#
# Uruchomienie: "C:\Program Files\Blender Foundation\Blender 5.2\blender.exe" -b --factory-startup -P blender/centralna.py -- [--preview PLIK.png]
import math
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy  # noqa: E402
from mathutils import Matrix, Vector  # noqa: E402

import lm_common as lm  # noqa: E402

lm.reset()

# Uklad lokalny: srodek dachu, os u wzdluz dachu na wschod (ENE, do Emilii Plater), os v na poludnie (SSE, do Al. Jerozolimskich)
F = lm.Frame(-192.7, 331.65, -19.22)

H_TOP = 20.5                      # wierzch dachu (LOD2 20.5-21.5 m nad najnizszym punktem terenu)
EDGE_V = 43.1                     # dlugie krawedzie dachu
ROW_V = 21.0                      # rzedy slupow (OSM)
COL_U = [-65.55 + 10.0 * k for k in range(14)]
S_COL, S_MID, S_TIP = 15.0, 18.0, 19.3    # podsufitka: nad glowicami, szczyt luku, koniec okapu

# obrys dachu (OSM, uklad lokalny): proste dlugie krawedzie, konce lekko wypukle na liniach rzedow slupow
END = [(-43.1, 66.1), (-37.2, 67.2), (-28.3, 68.8), (-21.0, 70.1), (0.0, 68.7), (21.0, 70.1), (28.3, 68.8),
       (37.2, 67.2), (43.1, 66.1)]

# bryly pod dachem (OSM): przeszklony srodek hali i dwa ciemne segmenty koncowe
MID = (-37.7, 33.4, 25.5)             # u0, u1, polowa szerokosci
EAST = (33.4, 58.9, 29.5)
WEST = (-57.7, -37.7, 25.7)
Y_DARK = 12.0                          # gora ciemnej elewacji segmentow koncowych (wyzej przeszklenie pod lukiem)


def end_u(v):
    for (v0, u0), (v1, u1) in zip(END, END[1:]):
        if v0 <= v <= v1:
            return u0 + (u1 - u0) * (v - v0) / (v1 - v0)
    return END[0][1]


def soffit(u, v):
    """Przekroj "trzech krzywych": luk nad hala miedzy rzedami slupow i skrzydla okapow."""
    a = abs(v)
    if a <= ROW_V:
        t = a / ROW_V
        return S_COL + (S_MID - S_COL) * (1 - t * t) ** 0.75
    t = min(1.0, (a - ROW_V) / (EDGE_V - ROW_V))
    return S_COL + (S_TIP - S_COL) * t ** 1.35


# ------------------------------------------------------------------ tekstury (numpy)
def tex_panels():
    """Pokrycie dachu: szaroniebieska papa/blacha w pasach z liniami laczen."""
    S = 512
    y, x = np.mgrid[0:S, 0:S] / S
    base = 0.82 + 0.025 * np.sin(x * 40.0) * np.sin(y * 13.0)
    lines = (np.abs(((x * 4) % 1) - 0.5) > 0.49) | (np.abs(((y * 2) % 1) - 0.5) > 0.493)
    v = np.where(lines, base * 0.8, base)
    return lm.save_texture('st_roof', np.dstack([v * 0.93, v * 0.98, v]))


def tex_ribs(name, period_px=16, width=0.35, base=0.86, dark=0.62, S=256):
    """Blacha falista: zeberka wzdluz osi v tekstury."""
    y, x = np.mgrid[0:S, 0:S] / S
    ph = ((x * S / period_px) % 1)
    rib = np.clip(1 - np.abs(ph - 0.5) / (width * 0.5), 0, 1)
    v = base - (base - dark) * (1 - rib) * 0.5 - 0.05 * rib ** 4
    return lm.save_texture(name, np.dstack([v, v, v * 1.01]))


def tex_end():
    """Ciemna elewacja segmentu koncowego: parter z witrynami, pas okien pietra (4.6-7.4 m), gladki pas pod napisem.
    Komorka 3 m x 12 m (0-12 m)."""
    W, H = 128, 512
    img = np.zeros((H, W, 3))
    img[:] = (0.17, 0.19, 0.20)
    yy = (np.arange(H)[::-1][:, None] / H) * 12.0
    xx = np.arange(W)[None, :] / W * 3.0
    shop = (yy > 0.2) & (yy < 3.4) & (xx > 0.08)
    img[np.broadcast_to(shop, (H, W))] = (0.30, 0.36, 0.38)
    win = (yy > 4.6) & (yy < 7.4) & (xx > 0.1)
    img[np.broadcast_to(win, (H, W))] = (0.26, 0.34, 0.38)
    frame = (win | shop) & ((xx < 0.14) | (np.abs(xx - 1.5) < 0.03) | (np.abs(yy - 2.6) < 0.03))
    img[np.broadcast_to(frame, (H, W))] = (0.09, 0.10, 0.11)
    seams = (np.abs(yy - 8.2) < 0.03) | (np.abs(yy - 4.2) < 0.04)
    img[np.broadcast_to(seams, (H, W))] *= 0.6
    img += np.random.default_rng(3).normal(0, 0.006, img.shape)
    return lm.save_texture('st_end', img)


def tex_curtain():
    """Sciana kurtynowa dlugich bokow: tafle 1.5 m x 3.75 m (komorka = 1 slupek x 4 rygle na 15 m)."""
    W, H = 64, 512
    img = np.zeros((H, W, 3))
    grad = np.linspace(1.1, 0.85, H)[:, None, None]
    img[:] = np.array((0.27, 0.36, 0.42)) * grad
    img[:, :3] = (0.14, 0.15, 0.16)
    for k in range(4):
        r = int(H * k / 4)
        img[r:r + 4] = (0.14, 0.15, 0.16)
    return lm.save_texture('st_curtain', img)


def tex_clerestory():
    W, H = 64, 128
    img = np.zeros((H, W, 3))
    img[:] = (0.24, 0.32, 0.37)
    img[:, :3] = (0.12, 0.13, 0.14)
    return lm.save_texture('st_clerestory', img)


M_ROOF = lm.material('st_roof', '#8fa3ae', rough=0.7, metal=0.1, image=tex_panels())
M_FASCIA = lm.material('st_fascia', '#e9e9e5', rough=0.45, metal=0.3, image=tex_ribs('st_fascia', 12, 0.5, 0.95, 0.72))
M_SOFFIT = lm.material('st_soffit', '#e2e2de', rough=0.6, metal=0.15, image=tex_ribs('st_soffit', 10, 0.6, 0.92, 0.66))
M_COL = lm.material('st_column', '#cdcdc8', rough=0.75, metal=0.05)
M_END = lm.material('st_end', '#ffffff', rough=0.55, metal=0.25, image=tex_end())
M_CURTAIN = lm.material('glass_st', '#ffffff', rough=0.1, metal=0.55, image=tex_curtain())
M_CLER = lm.material('glass_st_top', '#ffffff', rough=0.1, metal=0.55, image=tex_clerestory())
M_STONE = lm.material('st_stone', '#8a8680', rough=0.85)
M_LETTER = lm.material('st_letters', '#f3f3ef', rough=0.3, metal=0.5, emission='#f3f3ef', emission_strength=0.15)

objs = []

# ------------------------------------------------------------------ dach
roof = lm.Mesh('centralna_dach')
NV, NU = 86, 70
vs = [-EDGE_V + 2 * EDGE_V * i / NV for i in range(NV + 1)]
grid_s, grid_t, grid_uv = [], [], []
for v in vs:
    ue = end_u(v)
    rs, rt, ruv = [], [], []
    for j in range(NU + 1):
        u = -ue + 2 * ue * j / NU
        rs.append(F.p(u, soffit(u, v), v))
        rt.append(F.p(u, H_TOP, v))
        ruv.append((u, v))
    grid_s.append(rs)
    grid_t.append(rt)
    grid_uv.append(ruv)
# podsufitka (normalne w dol): zeberka w poprzek dachu (wzdluz v)
roof.grid(grid_s, M_SOFFIT, [[(u / 4.0, v / 4.0) for u, v in row] for row in grid_uv], smooth=True)
# wierzch (normalne w gore)
roof.grid([row[::-1] for row in grid_t], M_ROOF, [[(v / 12.0, u / 12.0) for u, v in row[::-1]] for row in grid_uv], smooth=False)
# czolo dachu dookola
perim = [grid_s[0][j] for j in range(NU + 1)] + [grid_s[i][NU] for i in range(1, NV + 1)] + \
        [grid_s[NV][j] for j in range(NU - 1, -1, -1)] + [grid_s[i][0] for i in range(NV - 1, 0, -1)]
acc = 0.0
for k in range(len(perim)):
    a, b = perim[k], perim[(k + 1) % len(perim)]
    L = math.hypot(b[0] - a[0], b[2] - a[2])
    q = [(b[0], b[1] - 0.02, b[2]), (a[0], a[1] - 0.02, a[2]), (a[0], H_TOP + 0.03, a[2]), (b[0], H_TOP + 0.03, b[2])]
    roof.poly(q, M_FASCIA, [((acc + L) / 3.0, 0), (acc / 3.0, 0), (acc / 3.0, 1), ((acc + L) / 3.0, 1)])
    acc += L
objs.append(roof.finish())

# ------------------------------------------------------------------ slupy z glowicami
cols = lm.Mesh('centralna_slupy')
for cu in COL_U:
    for cv in (-ROW_V, ROW_V):
        top = soffit(cu, cv) + 0.4
        # trzon 0.8 x 1.2 m (OSM); glowica ("kielich") rozszerza sie w podsufitke: szerzej w poprzek (dzwigar)
        prof = [(0.0, 0.4, 0.6), (top - 3.4, 0.4, 0.6), (top - 2.2, 0.55, 0.95), (top - 1.1, 0.95, 1.9),
                (top - 0.5, 1.4, 2.9), (top, 1.9, 3.8)]
        rings = [[F.p(cu - hu, y, cv - hv), F.p(cu + hu, y, cv - hv), F.p(cu + hu, y, cv + hv), F.p(cu - hu, y, cv + hv)]
                 for (y, hu, hv) in prof]
        for i in range(len(rings) - 1):
            r0, r1 = rings[i], rings[i + 1]
            for k in range(4):
                a0, b0, a1, b1 = r0[k], r0[(k + 1) % 4], r1[k], r1[(k + 1) % 4]
                cols.poly([b0, a0, a1, b1], M_COL, [(0, prof[i][0] / 3), (1, prof[i][0] / 3), (1, prof[i + 1][0] / 3), (0, prof[i + 1][0] / 3)])
objs.append(cols.finish())

# ------------------------------------------------------------------ hala
hall = lm.Mesh('centralna_hala')


def wall(ua, va, ub, vb, y0, top_fn, mat, cell_w, v_scale, v_off=0.0, steps=1):
    """Sciana od (ua,va) do (ub,vb) (lokalnie), gora wg top_fn(u, v). Kolejnosc wierzcholkow dla sciany skierowanej
    na zewnatrz przy obiegu przeciwnym do wskazowek na mapie (u w prawo, v w dol)."""
    L = math.hypot(ub - ua, vb - va)
    for k in range(steps):
        t0, t1 = k / steps, (k + 1) / steps
        pa = (ua + (ub - ua) * t0, va + (vb - va) * t0)
        pb = (ua + (ub - ua) * t1, va + (vb - va) * t1)
        ya, yb = top_fn(*pa), top_fn(*pb)
        s0, s1 = L * t0 / cell_w, L * t1 / cell_w
        hall.poly([F.p(pa[0], y0, pa[1]), F.p(pb[0], y0, pb[1]), F.p(pb[0], yb, pb[1]), F.p(pa[0], ya, pa[1])], mat,
                  [(s0, (y0 - v_off) / v_scale), (s1, (y0 - v_off) / v_scale), (s1, (yb - v_off) / v_scale), (s0, (ya - v_off) / v_scale)])


def box_walls(u0, u1, hv, y0, top_fn, mat, cell_w, v_scale, v_off=0.0, sides='nsew', steps=24):
    edges = {'w': ((u0, -hv), (u0, hv)), 's': ((u0, hv), (u1, hv)), 'e': ((u1, hv), (u1, -hv)), 'n': ((u1, -hv), (u0, -hv))}
    for s in sides:
        (a, b) = edges[s]
        wall(a[0], a[1], b[0], b[1], y0, top_fn, mat, cell_w, v_scale, v_off, steps if s in 'ew' else 6)


under = lambda u, v: soffit(u, v) + 0.25  # noqa: E731
# przeszklony srodek hali (dlugie boki): cokol + sciana kurtynowa do podsufitki
box_walls(MID[0], MID[1], MID[2], 0.0, lambda u, v: 1.0, M_STONE, 3.0, 3.0, sides='ns')
box_walls(MID[0], MID[1], MID[2], 1.0, under, M_CURTAIN, 1.5, 15.0, 0.0, sides='ns')
# segmenty koncowe: ciemna elewacja do Y_DARK, wyzej przeszklenie pod lukiem
for (u0, u1, hv), sides in ((EAST, 'nse'), (WEST, 'nsw')):
    box_walls(u0, u1, hv, 0.0, lambda u, v: Y_DARK, M_END, 3.0, 12.0, sides=sides)
    box_walls(u0, u1, hv, Y_DARK, under, M_CLER, 1.5, 4.0, Y_DARK, sides=sides)
    # schodek miedzy szerszym segmentem wschodnim a srodkiem hali
    if hv > MID[2]:
        for sv in (-1, 1):
            a, b = (u0, sv * MID[2]), (u0, sv * hv)
            if sv > 0:
                a, b = b, a
            wall(b[0], b[1], a[0], a[1], 0.0, under, M_END, 3.0, 12.0)
objs.append(hall.finish())


# ------------------------------------------------------------------ napisy WARSZAWA CENTRALNA na elewacjach koncowych
def text_mesh(body, size, center, right_uv, normal_uv, y):
    cu = bpy.data.curves.new('napis', 'FONT')
    cu.body = body
    cu.size = size
    cu.extrude = 0.08
    cu.align_x = 'CENTER'
    cu.align_y = 'CENTER'
    cu.space_character = 1.15
    ob = bpy.data.objects.new('napis', cu)
    bpy.context.scene.collection.objects.link(ob)

    def vec(duv):
        p = F.p(duv[0], 0, duv[1])
        return (p[0] - F.ox, p[2] - F.oz)
    r, n = vec(right_uv), vec(normal_uv)
    c = F.p(center[0], y, center[1])
    ob.matrix_world = Matrix(((r[0], 0, n[0], c[0]), (-r[1], 0, -n[1], -c[2]), (0, 1, 0, c[1]), (0, 0, 0, 1)))
    bpy.context.view_layer.update()
    bpy.ops.object.select_all(action='DESELECT')
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.convert(target='MESH')
    ob = bpy.context.view_layer.objects.active
    ob.data.materials.clear()
    ob.data.materials.append(M_LETTER)
    ob['noCollide'] = True
    return ob


objs.append(text_mesh('WARSZAWA CENTRALNA', 2.3, (EAST[1] + 0.12, 0.0), (0, -1), (1, 0), 10.5))
objs.append(text_mesh('WARSZAWA CENTRALNA', 2.3, (WEST[0] - 0.12, 0.0), (0, 1), (-1, 0), 10.5))

# ------------------------------------------------------------------ opis dla gry: kolizje i wykluczenia
outline = [F.xz(u, v) for v, u in END] + [F.xz(-u, v) for v, u in reversed(END)]


def rect(u0, u1, v0, v1):
    return [F.xz(u0, v0), F.xz(u1, v0), F.xz(u1, v1), F.xz(u0, v1)]


prisms = [
    lm.prism_json(outline, S_COL, H_TOP, 'Dworzec Centralny - dach'),
    lm.prism_json(rect(MID[0], MID[1], -MID[2], MID[2]), 0, S_COL, 'Dworzec Centralny'),
    lm.prism_json(rect(EAST[0], EAST[1], -EAST[2], EAST[2]), 0, S_COL, 'Dworzec Centralny'),
    lm.prism_json(rect(WEST[0], WEST[1], -WEST[2], WEST[2]), 0, S_COL, 'Dworzec Centralny'),
]
for cu in (COL_U[0], COL_U[-1]):
    for cv in (-ROW_V, ROW_V):
        prisms.append(lm.prism_json(rect(cu - 0.4, cu + 0.4, cv - 0.6, cv + 0.6), 0, S_COL, 'slup'))
lm.export('centralna', objs, {'name': 'Dworzec Centralny', 'exclude': [[round(c, 2) for p in outline for c in p]],
                              'prisms': prisms})

prev = lm.arg('--preview')
if prev:
    lm.preview(prev, F.p(125, 6, -55), F.p(40, 12, 0), lens=28)
