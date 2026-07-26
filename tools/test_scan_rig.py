import bpy
import json
import math
import sys
from mathutils import Vector

source = sys.argv[sys.argv.index("--") + 1]
bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=source)

rig = next(obj for obj in bpy.context.scene.objects if obj.type == "ARMATURE")
mesh = next(obj for obj in bpy.context.scene.objects if obj.type == "MESH")
depsgraph = bpy.context.evaluated_depsgraph_get()


def vertices():
    evaluated = mesh.evaluated_get(depsgraph)
    return [evaluated.matrix_world @ vertex.co for vertex in evaluated.data.vertices]


rest = vertices()
body_group = mesh.vertex_groups.get("body")
body_indices = [
    vertex.index
    for vertex in mesh.data.vertices
    if body_group and any(group.group == body_group.index and group.weight > 0.7 for group in vertex.groups)
]
checks = []
for name in sorted(bone.name for bone in rig.pose.bones if bone.name != "body"):
    bone = rig.pose.bones[name]
    bone.rotation_mode = "XYZ"
    bone.rotation_euler.z = 0.18 if name.startswith("L") else -0.18
    bpy.context.view_layer.update()
    posed = vertices()
    displacement = [(after - before).length for before, after in zip(rest, posed)]
    body_drift = max((displacement[index] for index in body_indices), default=0)
    checks.append({
        "bone": name,
        "movedVertices": sum(value > 0.005 for value in displacement),
        "maxDisplacement": round(max(displacement), 4),
        "bodyDrift": round(body_drift, 4),
    })
    bone.rotation_euler.z = 0
    bpy.context.view_layer.update()

passed = all(
    check["movedVertices"] > 20
    and 0.03 < check["maxDisplacement"] < 3.5
    and check["bodyDrift"] < 0.12
    for check in checks
)
print(json.dumps({"pass": passed, "checks": checks}, ensure_ascii=False))
if not passed:
    raise SystemExit(1)
