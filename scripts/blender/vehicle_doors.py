"""Partition the authored skin, not an extra panel over a closed body.
Convex triangle clipping preserves material assignment and the closed silhouette.
Pivots use the common front axle/cabin convention; visual only, no collider export.
"""
import bpy
from mathutils import Vector
from core_assets import p


def split_doors(body, roof=.80):
    body.data.calc_loop_triangles()
    faces = [([Vector((body.data.vertices[i].co.x, body.data.vertices[i].co.z,
                       -body.data.vertices[i].co.y)) for i in tri.vertices], tri.material_index)
             for tri in body.data.loop_triangles]
    materials = list(body.data.materials)

    def clip(poly, axis, value, sign):
        inside, outside = [], []
        for a, b in zip(poly, poly[1:] + poly[:1]):
            da, db = sign*(a[axis]-value), sign*(b[axis]-value)
            (inside if da >= -1e-8 else outside).append(a)
            if (da > 1e-8 and db < -1e-8) or (da < -1e-8 and db > 1e-8):
                q = a + (b-a) * (da/(da-db)); inside.append(q); outside.append(q)
        return inside, outside

    def geometry(name, records, pivot):
        verts, indices, slots = [], [], []
        for poly, material in records:
            if len(poly) < 3: continue
            offset = len(verts); verts.extend([p(v)-p(pivot) for v in poly])
            for i in range(1, len(poly)-1):
                indices.append((offset, offset+i, offset+i+1)); slots.append(material)
        data = bpy.data.meshes.new(name); data.from_pydata(verts, [], indices)
        for material in materials: data.materials.append(material)
        for face, slot in zip(data.polygons, slots): face.material_index = slot
        data.update(); return data

    for side, name in [(-1, 'DoorLeft'), (1, 'DoorRight')]:
        rest, door = [], []
        for poly, material in faces:
            normal = (poly[1]-poly[0]).cross(poly[2]-poly[0]).normalized()
            # Keep roof/hood/windscreen on the fixed cabin; peel only the side skin
            # and protruding side hardware, not a rectangular bite out of the glass.
            if abs(normal.x) < .45 and max(abs(v.x) for v in poly) < .91:
                rest.append((poly, material)); continue
            for axis, value, sign in [(0, side*.60, side), (1, -.50, 1),
                                      (1, roof-.025, -1), (2, -.12, 1), (2, .88, -1)]:
                poly, outside = clip(poly, axis, value, sign)
                if len(outside) >= 3: rest.append((outside, material))
                if len(poly) < 3: break
            if len(poly) >= 3: door.append((poly, material))
        pivot = (side*.82, 0, .88)
        root = bpy.data.objects.new(name, None); bpy.context.collection.objects.link(root)
        root.location = p(pivot); root['pivot'] = 'front hinge, runtime Y rotation'
        # A 25 mm inner skin gives the panel real visual thickness. Coincident
        # reverse faces self-shadow and cause striping when the door is open.
        inner = []
        for poly, material in door:
            normal = (poly[1]-poly[0]).cross(poly[2]-poly[0]).normalized()
            inner.append(([v-normal*.025 for v in reversed(poly)], material))
        two_sided = door + inner
        skin = bpy.data.objects.new(name+'Skin', geometry(name+'Skin', two_sided, pivot))
        bpy.context.collection.objects.link(skin); skin.parent = root
        root.select_set(True); skin.select_set(True)
        faces = rest
    body.data = geometry(body.name+'FixedSkin', faces, (0, 0, 0))
