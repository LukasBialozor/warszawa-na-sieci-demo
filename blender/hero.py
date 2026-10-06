# Bohater gry: cialo z przekrojow (tulow) i rur o zmiennym promieniu (konczyny), kostium (kolory wierzcholkow), oczy,
# szkielet z nazwanymi koscmi i automatycznymi wagami -> public/models/hero.glb
#
# Uruchomienie (z katalogu projektu):
#   "C:\Program Files\Blender Foundation\Blender 5.2\blender.exe" -b --factory-startup -P blender/hero.py -- [--preview KATALOG]
#
# Uklad Blendera: Z w gore, postac patrzy w -Y, +X = LEWA strona postaci (kosci *_l).
import bpy
import bmesh
import math
import os
import sys
from mathutils import Vector, Matrix

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
PREVIEW = argv[argv.index('--preview') + 1] if '--preview' in argv else None
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'public', 'models', 'hero.glb')

RED = (0.62, 0.035, 0.05, 1.0)
BLUE = (0.05, 0.12, 0.42, 1.0)
WHITE = (0.95, 0.95, 0.95, 1.0)
BLACK = (0.015, 0.015, 0.02, 1.0)

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene


def link(obj):
    scene.collection.objects.link(obj)
    return obj


def activate(obj, *others):
    bpy.ops.object.select_all(action='DESELECT')
    for o in others:
        o.select_set(True)
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


# ---------------------------------------------------------------- cialo z przekrojow (loft)
# Tulow: przekroje poziome (superelipsy) o zadanej szerokosci i glebokosci; rece i nogi: rury o zmiennym promieniu.
def catmull(vals, sub):
    """Interpolacja Catmull-Rom listy krotek liczb (sub punktow na odcinek)."""
    out = []
    n = len(vals)
    for i in range(n - 1):
        p0, p1, p2, p3 = vals[max(i - 1, 0)], vals[i], vals[i + 1], vals[min(i + 2, n - 1)]
        for k in range(sub):
            t = k / sub
            t2, t3 = t * t, t * t * t
            out.append(tuple(0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3)
                             for a, b, c, d in zip(p0, p1, p2, p3)))
    out.append(tuple(vals[-1]))
    return out


def superellipse(th, a, bf, bb, n):
    c, s_ = math.cos(th), math.sin(th)
    x = a * math.copysign(abs(c) ** (2 / n), c)
    y = (bf if s_ < 0 else bb) * math.copysign(abs(s_) ** (2 / n), s_)
    return x, y  # y < 0 = przod postaci


def bridge_rings(bm, rings):
    for r0, r1 in zip(rings, rings[1:]):
        n = len(r0)
        for i in range(n):
            j = (i + 1) % n
            bm.faces.new((r0[i], r0[j], r1[j], r1[i]))


def cap(bm, ring, center):
    c = bm.verts.new(center)
    n = len(ring)
    for i in range(n):
        bm.faces.new((ring[i], ring[(i + 1) % n], c))


# z, polszerokosc, glebokosc przod, glebokosc tyl, przesuniecie y, wykladnik (2 = elipsa, wiecej = bardziej "kanciasty")
TORSO = [
    (0.855, 0.085, 0.070, 0.080, 0.000, 2.2),
    (0.885, 0.138, 0.092, 0.108, 0.000, 2.4),
    (0.950, 0.168, 0.100, 0.118, 0.000, 2.5),
    (1.030, 0.158, 0.098, 0.104, 0.000, 2.5),
    (1.100, 0.145, 0.096, 0.096, 0.000, 2.6),
    (1.180, 0.158, 0.106, 0.098, 0.000, 2.6),
    (1.260, 0.178, 0.120, 0.104, 0.000, 2.7),
    (1.330, 0.194, 0.130, 0.110, 0.000, 2.8),
    (1.400, 0.204, 0.118, 0.112, 0.000, 2.8),
    (1.455, 0.186, 0.098, 0.100, 0.000, 2.6),
    (1.505, 0.132, 0.078, 0.084, 0.004, 2.4),
    (1.540, 0.074, 0.066, 0.070, 0.010, 2.2),
    (1.600, 0.067, 0.066, 0.068, 0.012, 2.0),
    (1.680, 0.062, 0.062, 0.064, 0.012, 2.0),
]
SEG = 36


def build_torso(bm):
    rings = []
    for z, a, bf, bb, yc, n in catmull(TORSO, 3):
        ring = []
        for i in range(SEG):
            th = 2 * math.pi * i / SEG
            x, y = superellipse(th, a, bf, bb, n)
            ring.append(bm.verts.new((x, yc + y, z)))
        rings.append(ring)
    bridge_rings(bm, rings)
    cap(bm, rings[0], (0, 0, TORSO[0][0] - 0.02))
    cap(bm, rings[-1], (0, 0.012, TORSO[-1][0] + 0.01))


def build_tube(bm, pts, radii, ref=Vector((0, 1, 0)), segs=20, sub=3):
    data = catmull([tuple(p) + tuple(r) for p, r in zip(pts, radii)], sub)
    P = [Vector(d[:3]) for d in data]
    rings = []
    for k, d in enumerate(data):
        t = (P[min(k + 1, len(P) - 1)] - P[max(k - 1, 0)]).normalized()
        u = t.cross(ref).normalized()
        v = u.cross(t).normalized()
        ra, rb = d[3], d[4]
        rings.append([bm.verts.new(P[k] + u * (math.cos(2 * math.pi * i / segs) * ra) + v * (math.sin(2 * math.pi * i / segs) * rb))
                      for i in range(segs)])
    bridge_rings(bm, rings)
    t0 = (P[1] - P[0]).normalized()
    t1 = (P[-1] - P[-2]).normalized()
    cap(bm, rings[0], P[0] - t0 * data[0][3] * 0.6)
    cap(bm, rings[-1], P[-1] + t1 * data[-1][3] * 0.8)


def ellipsoid(bm, center, axes, scale, segs=20, rings=12):
    """axes: (os_x, os_y, os_z) - wektory kierunkow osi; scale: polosie."""
    geom = bmesh.ops.create_uvsphere(bm, u_segments=segs, v_segments=rings, radius=1.0)
    ax, ay, az = axes
    m = Matrix(((ax.x, ay.x, az.x, 0), (ax.y, ay.y, az.y, 0), (ax.z, ay.z, az.z, 0), (0, 0, 0, 1)))
    m = Matrix.Translation(center) @ m @ Matrix.Diagonal((*scale, 1.0))
    bmesh.ops.transform(bm, matrix=m, verts=geom['verts'])


bm = bmesh.new()
build_torso(bm)
for sx in (1, -1):
    arm_pts = [(0.15 * sx, 0.01, 1.445), (0.215 * sx, 0.012, 1.432), (0.268 * sx, 0.015, 1.372), (0.315 * sx, 0.018, 1.322),
               (0.365 * sx, 0.02, 1.27), (0.42 * sx, 0.01, 1.21), (0.47 * sx, 0.0, 1.155), (0.51 * sx, -0.01, 1.11)]
    arm_r = [(0.080, 0.080), (0.080, 0.076), (0.063, 0.060), (0.060, 0.056), (0.046, 0.046), (0.052, 0.046), (0.044, 0.038), (0.034, 0.029)]
    build_tube(bm, [Vector(p) for p in arm_pts], arm_r)
    # dlon (rekawica): splaszczona elipsoida wzdluz przedramienia + kciuk
    hd = (Vector((0.61 * sx, -0.02, 1.00)) - Vector((0.51 * sx, -0.01, 1.11))).normalized()
    side = hd.cross(Vector((0, 1, 0))).normalized()
    thick = side.cross(hd).normalized()
    ellipsoid(bm, Vector((0.548 * sx, -0.014, 1.066)), (side, thick, hd), (0.041, 0.022, 0.066))
    ellipsoid(bm, Vector((0.532 * sx, -0.038, 1.078)), (side, thick, hd), (0.013, 0.013, 0.034), 10, 8)
    # noga zaczyna sie wewnatrz miednicy (bez uskoku na biodrze), najszersza w gornej czesci uda
    leg_pts = [(0.085 * sx, 0.0, 1.02), (0.098 * sx, -0.002, 0.93), (0.104 * sx, -0.005, 0.84), (0.106 * sx, -0.008, 0.72),
               (0.108 * sx, -0.010, 0.58), (0.108 * sx, -0.012, 0.50), (0.108 * sx, 0.004, 0.40), (0.108 * sx, 0.014, 0.28),
               (0.108 * sx, 0.02, 0.16), (0.108 * sx, 0.02, 0.085)]
    leg_r = [(0.070, 0.080), (0.092, 0.094), (0.095, 0.094), (0.084, 0.084), (0.068, 0.068), (0.057, 0.059), (0.062, 0.065),
             (0.054, 0.054), (0.041, 0.042), (0.037, 0.040)]
    build_tube(bm, [Vector(p) for p in leg_pts], leg_r)
    # stopa
    ellipsoid(bm, Vector((0.108 * sx, -0.04, 0.038)), (Vector((1, 0, 0)), Vector((0, 1, 0)), Vector((0, 0, 1))), (0.040, 0.100, 0.038))
bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
for f in bm.faces:
    f.smooth = True
final = bpy.data.meshes.new('BodyMesh')
bm.to_mesh(final)
bm.free()
body = link(bpy.data.objects.new('Body', final))

# ---------------------------------------------------------------- kosci
BONES = [  # nazwa, glowa, ogon, rodzic, polaczona
    ('hips', (0, 0, 0.95), (0, 0, 1.10), None, False),
    ('spine', (0, 0.005, 1.10), (0, 0, 1.27), 'hips', True),
    ('chest', (0, 0, 1.27), (0, 0.005, 1.46), 'spine', True),
    ('neck', (0, 0.012, 1.50), (0, 0.008, 1.60), 'chest', False),
    ('head', (0, 0.008, 1.60), (0, 0.0, 1.85), 'neck', True),
]
for s, sx in (('l', 1), ('r', -1)):
    BONES += [
        (f'clavicle_{s}', (0.03 * sx, 0.012, 1.44), (0.19 * sx, 0.012, 1.445), 'chest', False),
        (f'upperarm_{s}', (0.20 * sx, 0.012, 1.445), (0.36 * sx, 0.02, 1.27), f'clavicle_{s}', False),
        (f'forearm_{s}', (0.36 * sx, 0.02, 1.27), (0.51 * sx, -0.01, 1.11), f'upperarm_{s}', True),
        (f'hand_{s}', (0.51 * sx, -0.01, 1.11), (0.62 * sx, -0.02, 0.99), f'forearm_{s}', True),
        (f'thigh_{s}', (0.095 * sx, 0, 0.92), (0.105 * sx, -0.008, 0.50), 'hips', False),
        (f'shin_{s}', (0.105 * sx, -0.008, 0.50), (0.105 * sx, 0.02, 0.10), f'thigh_{s}', True),
        (f'foot_{s}', (0.105 * sx, 0.02, 0.10), (0.105 * sx, -0.13, 0.035), f'shin_{s}', True),
    ]

arm_data = bpy.data.armatures.new('HeroRig')
rig = link(bpy.data.objects.new('HeroRig', arm_data))
activate(rig)
bpy.ops.object.mode_set(mode='EDIT')
for name, h, t, parent, conn in BONES:
    eb = arm_data.edit_bones.new(name)
    eb.head = h
    eb.tail = t
    if parent:
        eb.parent = arm_data.edit_bones[parent]
        eb.use_connect = conn
bpy.ops.object.mode_set(mode='OBJECT')


# ---------------------------------------------------------------- kolory kostiumu
def seg_dist(p, a, b):
    a, b = Vector(a), Vector(b)
    ab = b - a
    t = max(0.0, min(1.0, (p - a).dot(ab) / max(ab.length_squared, 1e-9)))
    return (p - (a + ab * t)).length, t


def suit_color(p, n):
    x, y, z = p
    ax = abs(x)
    # najblizsza kosc
    best, bname, bt = 1e9, None, 0
    for name, h, t, _, _ in BONES:
        d, tt = seg_dist(p, h, t)
        if d < best:
            best, bname, bt = d, name, tt
    if bname in ('head', 'neck'):
        return RED
    if bname.startswith(('forearm', 'hand')):
        return RED
    if bname.startswith('upperarm'):
        # gora i zewnetrzna strona ramienia czerwone, spod niebieski
        return RED if n.z > -0.25 else BLUE
    if bname.startswith('clavicle'):
        return RED
    if bname.startswith('shin') or bname.startswith('foot'):
        return RED if z < 0.47 else BLUE  # czerwone buty od kolana w dol
    if bname.startswith('thigh'):
        return BLUE
    # tulow: czerwone "V" od pasa do barkow, niebieskie boki
    if z > 1.30:
        return RED
    half = 0.055 + (z - 0.95) * 0.32
    return RED if ax < half else BLUE


col = final.color_attributes.new(name='Col', type='FLOAT_COLOR', domain='POINT')
for v in final.vertices:
    col.data[v.index].color = suit_color(v.co, v.normal)

# ---------------------------------------------------------------- auto wagi dla ciala
activate(rig, body)
bpy.ops.object.parent_set(type='ARMATURE_AUTO')


# ---------------------------------------------------------------- glowa, oczy (sztywne czesci)
def add_part(name, build, color, group):
    bm = bmesh.new()
    build(bm)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    obj = link(bpy.data.objects.new(name, me))
    c = me.color_attributes.new(name='Col', type='FLOAT_COLOR', domain='POINT')
    for v in me.vertices:
        c.data[v.index].color = color(v.co) if callable(color) else color
    vg = obj.vertex_groups.new(name=group)
    vg.add([v.index for v in me.vertices], 1.0, 'REPLACE')
    for f in me.polygons:
        f.use_smooth = True
    return obj


def sphere(bm, center, scale, rot=Matrix.Identity(3), segs=24, rings=16):
    geom = bmesh.ops.create_uvsphere(bm, u_segments=segs, v_segments=rings, radius=1.0)
    m = Matrix.Translation(center) @ rot.to_4x4() @ Matrix.Diagonal((*scale, 1.0))
    bmesh.ops.transform(bm, matrix=m, verts=geom['verts'])  # tylko nowe wierzcholki


HEAD_C = Vector((0, 0.0, 1.725))
HEAD_S = (0.108, 0.120, 0.128)


def head_shape(bm):
    sphere(bm, HEAD_C, HEAD_S, segs=32, rings=24)
    # zwezenie zuchwy: dolna polowa glowy wezsza, broda lekko do przodu
    for v in bm.verts:
        t = max(0.0, (HEAD_C.z - v.co.z) / HEAD_S[2])
        v.co.x = HEAD_C.x + (v.co.x - HEAD_C.x) * (1 - 0.28 * t * t)
        if v.co.y < HEAD_C.y:
            v.co.y = HEAD_C.y + (v.co.y - HEAD_C.y) * (1 - 0.1 * t)


head = add_part('Head', head_shape, RED, 'head')


def head_surface(x, z):
    # punkt na przedniej powierzchni elipsoidy glowy
    u = (x - HEAD_C.x) / HEAD_S[0]
    w = (z - HEAD_C.z) / HEAD_S[2]
    yy = -HEAD_S[1] * math.sqrt(max(0.0, 1 - u * u - w * w))
    return Vector((x, HEAD_C.y + yy, z))


eyes = []
for sx in (1, -1):
    ex, ez = 0.048 * sx, 1.745
    pos = head_surface(ex, ez)
    # obrot: soczewka lezy na powierzchni glowy, lekko pochylona na zewnatrz
    nrm = Vector(((pos.x - HEAD_C.x) / HEAD_S[0] ** 2, (pos.y - HEAD_C.y) / HEAD_S[1] ** 2, (pos.z - HEAD_C.z) / HEAD_S[2] ** 2)).normalized()
    rot = Vector((0, -1, 0)).rotation_difference(nrm).to_matrix() @ Matrix.Rotation(math.radians(-24 * sx), 3, 'Y')
    rim = add_part(f'EyeRim{sx}', lambda bm, p=pos, r=rot: sphere(bm, p, (0.047, 0.012, 0.034), r, 20, 10), BLACK, 'head')
    lens = add_part(f'Eye{sx}', lambda bm, p=pos + nrm * 0.0035, r=rot: sphere(bm, p, (0.039, 0.011, 0.027), r, 20, 10), WHITE, 'head')
    eyes += [rim, lens]

# polacz sztywne czesci z cialem (grupy wierzcholkow lacza sie po nazwie)
activate(body, head, *eyes)
bpy.ops.object.join()

mat = bpy.data.materials.new('Suit')
try:
    mat.use_nodes = True
except Exception:
    pass
nt = mat.node_tree
bsdf = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
attr = nt.nodes.new('ShaderNodeVertexColor')
attr.layer_name = 'Col'
nt.links.new(attr.outputs['Color'], bsdf.inputs['Base Color'])
bsdf.inputs['Roughness'].default_value = 0.55
body.data.materials.clear()
body.data.materials.append(mat)
body.data.color_attributes.active_color = body.data.color_attributes['Col']

# ---------------------------------------------------------------- podglad
if PREVIEW:
    os.makedirs(PREVIEW, exist_ok=True)
    cam_data = bpy.data.cameras.new('Cam')
    cam = link(bpy.data.objects.new('Cam', cam_data))
    cam_data.lens = 70
    scene.camera = cam
    sun = link(bpy.data.objects.new('Sun', bpy.data.lights.new('Sun', 'SUN')))
    sun.data.energy = 3.0
    sun.rotation_euler = (math.radians(50), 0, math.radians(-30))
    world = bpy.data.worlds.new('W')
    scene.world = world
    try:
        world.use_nodes = True
    except Exception:
        pass
    world.node_tree.nodes['Background'].inputs['Color'].default_value = (0.55, 0.6, 0.66, 1)
    world.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.7
    scene.render.resolution_x, scene.render.resolution_y = 700, 900
    try:
        scene.render.engine = 'BLENDER_WORKBENCH'
        scene.display.shading.light = 'STUDIO'
        scene.display.shading.color_type = 'VERTEX'
    except Exception:
        scene.render.engine = 'BLENDER_EEVEE'
    for label, loc, rot in (('front', (0, -4.6, 1.05), (90, 0, 0)), ('side', (4.6, 0, 1.05), (90, 0, 90)),
                            ('face', (0.25, -1.3, 1.72), (90, 0, 11))):
        cam.location = loc
        cam.rotation_euler = [math.radians(a) for a in rot]
        scene.render.filepath = os.path.join(PREVIEW, f'hero_{label}.png')
        bpy.ops.render.render(write_still=True)

# ---------------------------------------------------------------- eksport
os.makedirs(os.path.dirname(OUT), exist_ok=True)
activate(rig, body)
bpy.ops.export_scene.gltf(
    filepath=OUT, export_format='GLB', use_selection=True, export_apply=False,
    export_skins=True, export_animations=False, export_yup=True, export_morph=False,
    export_vertex_color='ACTIVE', export_def_bones=False, export_materials='EXPORT',
)
print('HERO_OK', OUT, len(body.data.vertices), 'wierzcholkow')
