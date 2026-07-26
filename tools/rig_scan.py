import bpy
import sys
from mathutils import Vector


args = sys.argv[sys.argv.index("--") + 1:]
source, output = args[0], args[1]


def sample_path(points, count):
    lengths = [(points[index + 1] - points[index]).length for index in range(len(points) - 1)]
    total = sum(lengths)
    result = [points[0]]
    for step in range(1, count):
        distance = total * step / count
        for index, length in enumerate(lengths):
            if distance <= length:
                result.append(points[index].lerp(points[index + 1], distance / length))
                break
            distance -= length
    return result + [points[-1]]


bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=source)
meshes = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]

bpy.ops.object.armature_add(enter_editmode=True)
rig = bpy.context.object
rig.name = "JumpingSpiderRig"
rig.data.name = rig.name
rig.data.edit_bones.remove(rig.data.edit_bones[0])
body = rig.data.edit_bones.new("body")
body.head, body.tail = (0, 0, -1), (0, 0, 2)

# ponytail: envelope auto-weights are a migration probe; hand-painted weights
# are required before this scan is used as the production walking character.
controls = [
    [(-1.1, -2.5, 0), (-2.2, -3.4, -.5), (-3.6, -4.6, -.8), (-5.0, -5.4, -1.1)],
    [(-1.4, -1.1, 0), (-3.0, -1.9, -.5), (-4.5, -2.4, -.9), (-5.1, -2.8, -1.2)],
    [(-1.4, 1.0, 0), (-3.0, 1.8, -.5), (-4.4, 2.5, -.8), (-5.0, 3.1, -1.0)],
    [(-1.1, 2.4, 0), (-2.0, 3.5, -.3), (-3.3, 4.3, -.7), (-4.6, 4.7, -.9)],
]
for side, label in [(-1, "L"), (1, "R")]:
    for pair, path in enumerate(controls, 1):
        points = [Vector((side * abs(x), y, z)) for x, y, z in path]
        points = sample_path(points, 7)
        parent = body
        for index, (head, tail) in enumerate(zip(points, points[1:]), 1):
            bone = rig.data.edit_bones.new(f"{label}{pair}_{index}")
            bone.head, bone.tail, bone.parent = head, tail, parent
            parent = bone
bpy.ops.object.mode_set(mode="OBJECT")

for mesh in meshes:
    bpy.ops.object.select_all(action="DESELECT")
    mesh.select_set(True)
    rig.select_set(True)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.parent_set(type="ARMATURE_AUTO")

bpy.ops.export_scene.gltf(filepath=output, export_format="GLB", export_animations=True)
