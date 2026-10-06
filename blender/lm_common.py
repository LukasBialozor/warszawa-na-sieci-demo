# Wspolne narzedzia dla modeli landmarkow (Blender 5.x): budowanie siatek we wspolrzednych gry, materialy,
# tekstury z numpy, eksport .glb + opis kolizji .json.
#
# Uklad gry: x = wschod, y = gora, z = poludnie (metry, PKiN = 0,0). Blender: (x, -z, y), Z w gore.
# Eksport glTF (+Y w gore) zamienia to z powrotem na uklad gry, wiec modele nie wymagaja ustawiania w grze.
import bpy
import bmesh
import json
import math
import os
import sys

import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MODELS = os.path.join(ROOT, 'public', 'models')
TEX_DIR = os.path.join(ROOT, 'data', 'landmarks', 'tex')
ARGV = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []


def arg(name, default=None):
    return ARGV[ARGV.index(name) + 1] if name in ARGV else default


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def load_json(rel):
    with open(os.path.join(ROOT, rel), encoding='utf-8') as f:
        return json.load(f)


# ------------------------------------------------------------------ kolory i materialy
def srgb_to_lin(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def hex_rgb(h):
    h = h.lstrip('#')
    return tuple(int(h[i:i + 2], 16) / 255 for i in (0, 2, 4))


def lin(h):
    return tuple(srgb_to_lin(c) for c in hex_rgb(h))


def material(name, color='#ffffff', rough=0.8, metal=0.0, image=None, emission=None, emission_strength=1.0,
             normal=None, normal_strength=1.0):
    """Material PBR. image: sciezka tekstury (mnozona przez kolor), normal: mapa normalnych."""
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    bsdf = nt.nodes['Principled BSDF']
    bsdf.inputs['Base Color'].default_value = (*lin(color), 1)
    bsdf.inputs['Roughness'].default_value = rough
    bsdf.inputs['Metallic'].default_value = metal
    if image:
        tex = nt.nodes.new('ShaderNodeTexImage')
        tex.image = bpy.data.images.load(image, check_existing=True)
        if color.lower() != '#ffffff':
            mix = nt.nodes.new('ShaderNodeMix')
            mix.data_type = 'RGBA'
            mix.blend_type = 'MULTIPLY'
            mix.inputs['Factor'].default_value = 1.0
            nt.links.new(tex.outputs['Color'], mix.inputs['A'])
            mix.inputs['B'].default_value = (*lin(color), 1)
            nt.links.new(mix.outputs['Result'], bsdf.inputs['Base Color'])
        else:
            nt.links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
    if normal:
        tex = nt.nodes.new('ShaderNodeTexImage')
        tex.image = bpy.data.images.load(normal, check_existing=True)
        tex.image.colorspace_settings.name = 'Non-Color'
        nm = nt.nodes.new('ShaderNodeNormalMap')
        nm.inputs['Strength'].default_value = normal_strength
        nt.links.new(tex.outputs['Color'], nm.inputs['Color'])
        nt.links.new(nm.outputs['Normal'], bsdf.inputs['Normal'])
    if emission:
        bsdf.inputs['Emission Color'].default_value = (*lin(emission), 1)
        bsdf.inputs['Emission Strength'].default_value = emission_strength
    return m


def save_texture(name, rgb):
    """rgb: tablica numpy (h, w, 3) w [0,1] (sRGB), wiersz 0 = gora obrazu -> PNG w data/landmarks/tex"""
    os.makedirs(TEX_DIR, exist_ok=True)
    h, w = rgb.shape[:2]
    img = bpy.data.images.new(name, w, h, alpha=False)
    rgba = np.ones((h, w, 4), dtype=np.float32)
    rgba[:, :, :3] = np.clip(rgb, 0, 1)
    img.pixels.foreach_set(rgba[::-1].ravel())   # Blender: wiersz 0 = dol obrazu
    path = os.path.join(TEX_DIR, name + '.png')
    img.filepath_raw = path
    img.file_format = 'PNG'
    img.save()
    return path


# ------------------------------------------------------------------ uklad lokalny budynku
class Frame:
    """Uklad lokalny: poczatek (ox, oz), os u pod katem `ang` (stopnie, atan2(dz, dx) w ukladzie gry), os v prostopadla."""

    def __init__(self, ox=0.0, oz=0.0, ang=0.0):
        a = math.radians(ang)
        self.ox, self.oz = ox, oz
        self.ux, self.uz = math.cos(a), math.sin(a)
        self.vx, self.vz = -math.sin(a), math.cos(a)

    def p(self, u, y, v):
        return (self.ox + u * self.ux + v * self.vx, y, self.oz + u * self.uz + v * self.vz)

    def xz(self, u, v):
        return (self.ox + u * self.ux + v * self.vx, self.oz + u * self.uz + v * self.vz)

    def local(self, x, z):
        dx, dz = x - self.ox, z - self.oz
        return (dx * self.ux + dz * self.uz, dx * self.vx + dz * self.vz)


# ------------------------------------------------------------------ budowanie siatki (wspolrzedne gry)
class Mesh:
    def __init__(self, name):
        self.name = name
        self.bm = bmesh.new()
        self.uv = self.bm.loops.layers.uv.new('UVMap')
        self.mats = []

    def mi(self, mat):
        if mat not in self.mats:
            self.mats.append(mat)
        return self.mats.index(mat)

    def v(self, p):
        x, y, z = p
        return self.bm.verts.new((x, -z, y))

    def face(self, verts, mat, uvs=None, smooth=False):
        try:
            f = self.bm.faces.new(verts)
        except ValueError:
            return None
        f.material_index = self.mi(mat)
        f.smooth = smooth
        if uvs:
            for loop, uv in zip(f.loops, uvs):
                loop[self.uv].uv = uv
        return f

    def poly(self, pts, mat, uvs=None, smooth=False):
        """Wielokat z punktow (x, y, z) gry; kolejnosc przeciwna do ruchu wskazowek patrzac od strony normalnej."""
        return self.face([self.v(p) for p in pts], mat, uvs, smooth)

    def grid(self, P, mat, UV=None, smooth=True, closed_u=False):
        """Powierzchnia z siatki punktow P[i][j] (i wzdluz v, j wzdluz u); normalna = du x dv (prawoskretnie)."""
        V = [[self.v(p) for p in row] for row in P]
        ni, nj = len(V), len(V[0])
        for i in range(ni - 1):
            for j in range(nj - 1 + (1 if closed_u else 0)):
                j1 = (j + 1) % nj
                q = [V[i][j], V[i][j1], V[i + 1][j1], V[i + 1][j]]
                uv = None
                if UV:
                    uv = [UV[i][j], UV[i][j + 1] if j + 1 < nj else UV[i][nj - 1], UV[i + 1][j + 1] if j + 1 < nj else UV[i + 1][nj - 1], UV[i + 1][j]]
                self.face(q, mat, uv, smooth)
        return V

    def finish(self, collide=True):
        me = bpy.data.meshes.new(self.name)
        bmesh.ops.remove_doubles(self.bm, verts=self.bm.verts, dist=1e-4)
        self.bm.normal_update()
        self.bm.to_mesh(me)
        self.bm.free()
        for m in self.mats:
            me.materials.append(m)
        ob = bpy.data.objects.new(self.name, me)
        bpy.context.scene.collection.objects.link(ob)
        if not collide:
            ob['noCollide'] = True   # glTF extras -> userData.noCollide (bez raycastow)
        return ob


# ------------------------------------------------------------------ bryly
def ring_area(r):
    a = 0.0
    for i in range(len(r)):
        x0, z0 = r[i]
        x1, z1 = r[(i + 1) % len(r)]
        a += x0 * z1 - x1 * z0
    return a / 2


def wall_strip(m, ring, y0, y1, mat, win=3.6, floor=3.3, u0=0.0, closed=True, top_fn=None):
    """Sciany wzdluz obrysu ring [(x, z)]; normalne na zewnatrz dla ring_area(ring) < 0 (patrz orient_out).
    UV: u = odleglosc w poziomie / win, v = wysokosc / floor (tekstura: 1 komorka = 1 okno x 1 pietro)."""
    n = len(ring)
    s = u0
    for i in range(n if closed else n - 1):
        (ax, az), (bx, bz) = ring[i], ring[(i + 1) % n]
        L = math.hypot(bx - ax, bz - az)
        if L < 1e-4:
            continue
        ta = top_fn(ax, az) if top_fn else y1
        tb = top_fn(bx, bz) if top_fn else y1
        m.poly([(ax, y0, az), (bx, y0, bz), (bx, tb, bz), (ax, ta, az)], mat,
               [(s / win, y0 / floor), ((s + L) / win, y0 / floor), ((s + L) / win, tb / floor), (s / win, ta / floor)])
        s += L
    return s


def cap(m, ring, y, mat, up=True, uv_scale=12.0):
    """Plaski wielokat na wysokosci y. Normalna w gore (+y) <=> ring_area < 0 (os z gry wskazuje na poludnie)."""
    pts = [(x, y, z) for x, z in ring]
    if (ring_area(ring) < 0) != up:
        pts = pts[::-1]
    return m.poly(pts, mat, [(p[0] / uv_scale, p[2] / uv_scale) for p in pts])


def prism(m, ring, y0, y1, wall_mat, top_mat, bottom=False, **kw):
    """Graniastoslup: ring [(x, z)] dowolnie zorientowany."""
    if ring_area(ring) < 0:
        ring = ring[::-1]
    wall_strip(m, orient_out(ring), y0, y1, wall_mat, **kw)
    cap(m, ring, y1, top_mat, True)
    if bottom:
        cap(m, ring, y0, top_mat, False)


def orient_out(ring):
    """Kolejnosc punktow, dla ktorej wall_strip daje normalne na zewnatrz."""
    return ring if ring_area(ring) < 0 else ring[::-1]


def lathe(m, cx, cz, profile, mat, segs=16, y_off=0.0, uv_v=1.0, smooth=True, cap_top=True, phase=0.0):
    """Bryla obrotowa: profile [(r, y)] od dolu do gory, os pionowa w (cx, cz)."""
    P, UV = [], []
    for i, (r, y) in enumerate(profile):
        row, uvr = [], []
        for j in range(segs + 1):
            a = 2 * math.pi * j / segs + phase
            row.append((cx + r * math.cos(a), y + y_off, cz + r * math.sin(a)))
            uvr.append((j / segs * 4, i / max(1, len(profile) - 1) * uv_v))
        P.append(row)
        UV.append(uvr)
    # kolejnosc: i rosnie w gore, j rosnie z katem (x -> z); normalna = du x dv musi wskazywac na zewnatrz
    V = [[m.v(p) for p in row] for row in P]
    for i in range(len(V) - 1):
        for j in range(segs):
            q = [V[i][j], V[i + 1][j], V[i + 1][j + 1], V[i][j + 1]]
            m.face(q, mat, [UV[i][j], UV[i + 1][j], UV[i + 1][j + 1], UV[i][j + 1]], smooth)
    if cap_top and profile[-1][0] > 1e-3:
        top = [V[-1][j] for j in reversed(range(segs))]
        m.face(top, mat)
    return V


def box(m, f, u0, u1, v0, v1, y0, y1, wall_mat, top_mat=None, bottom=False, **kw):
    """Prostopadloscian w ukladzie Frame f."""
    ring = [f.xz(u0, v0), f.xz(u1, v0), f.xz(u1, v1), f.xz(u0, v1)]
    prism(m, ring, y0, y1, wall_mat, top_mat or wall_mat, bottom, **kw)
    return ring


# ------------------------------------------------------------------ eksport
def export(name, objects, meta):
    """Zapisuje public/models/<name>.glb i <name>.json oraz dopisuje nazwe do public/models/landmarks.json."""
    os.makedirs(MODELS, exist_ok=True)
    bpy.ops.object.select_all(action='DESELECT')
    for o in objects:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    path = os.path.join(MODELS, name + '.glb')
    bpy.ops.export_scene.gltf(
        filepath=path, export_format='GLB', use_selection=True, export_apply=True, export_yup=True,
        export_materials='EXPORT', export_image_format='AUTO', export_texcoords=True, export_normals=True,
        export_extras=True,
    )
    meta = dict(meta)
    meta['model'] = name + '.glb'
    with open(os.path.join(MODELS, name + '.json'), 'w', encoding='utf-8') as f:
        json.dump(meta, f, separators=(',', ':'))
    reg = os.path.join(MODELS, 'landmarks.json')
    names = []
    if os.path.exists(reg):
        with open(reg, encoding='utf-8') as f:
            names = json.load(f)
    if name not in names:
        names.append(name)
        with open(reg, 'w', encoding='utf-8') as f:
            json.dump(names, f)
    tris = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in objects if o.type == 'MESH')
    print(f'LANDMARK_OK {name}: {tris} trojkatow -> {path} ({os.path.getsize(path) / 1e6:.2f} MB)')


def prism_json(ring, base, top, name=None, holes=None, eave=None, hf=None):
    """Graniastoslup kolizji w formacie gry: obrys pole > 0 (x/z), dziury pole < 0."""
    r = ring if ring_area(ring) > 0 else ring[::-1]
    out = {'o': [round(c, 2) for p in r for c in p], 'b': round(base, 2), 't': round(top, 2)}
    if holes:
        out['h'] = [[round(c, 2) for p in (h if ring_area(h) < 0 else h[::-1]) for c in p] for h in holes]
    if name:
        out['n'] = name
    if eave is not None:
        out['e'] = round(eave, 2)
    if hf is not None:
        out['hf'] = hf
    return out


# ------------------------------------------------------------------ podglad (render)
def preview(path, cam_pos, target, lens=35, size=(1200, 800), sun_rot=(50, 0, 215)):
    """Szybki render EEVEE z kamery w pozycji gry cam_pos patrzacej na target."""
    from mathutils import Vector
    sc = bpy.context.scene
    cam_data = bpy.data.cameras.new('PrevCam')
    cam = bpy.data.objects.new('PrevCam', cam_data)
    sc.collection.objects.link(cam)
    cam_data.lens = lens
    cam_data.clip_end = 5000
    p = Vector((cam_pos[0], -cam_pos[2], cam_pos[1]))
    t = Vector((target[0], -target[2], target[1]))
    cam.location = p
    cam.rotation_euler = (t - p).to_track_quat('-Z', 'Y').to_euler()
    sc.camera = cam
    if 'PrevSun' not in bpy.data.objects:
        sun = bpy.data.objects.new('PrevSun', bpy.data.lights.new('PrevSun', 'SUN'))
        sun.data.energy = 4.0
        sun.rotation_euler = [math.radians(a) for a in sun_rot]
        sc.collection.objects.link(sun)
        world = bpy.data.worlds.new('PrevWorld')
        sc.world = world
        world.use_nodes = True
        world.node_tree.nodes['Background'].inputs['Color'].default_value = (0.5, 0.6, 0.75, 1)
        world.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.8
    sc.render.engine = 'BLENDER_EEVEE'
    sc.render.resolution_x, sc.render.resolution_y = size
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True)
    bpy.data.objects.remove(cam)
