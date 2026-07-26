import bpy
import json
import sys
from pathlib import Path

source = sys.argv[sys.argv.index("--") + 1]
bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=source) if Path(source).suffix.lower() == ".glb" else bpy.ops.import_scene.fbx(filepath=source)

rig = next(obj for obj in bpy.context.scene.objects if obj.type == "ARMATURE")
mesh = next(obj for obj in bpy.context.scene.objects if obj.type == "MESH")
depsgraph = bpy.context.evaluated_depsgraph_get()
leg_roots = [f"Bone.{pair:03}_{side}" for pair in range(1, 5) for side in "LR"]


def vertices():
    evaluated = mesh.evaluated_get(depsgraph)
    return [evaluated.matrix_world @ vertex.co for vertex in evaluated.data.vertices]


rest = vertices()
checks = []
for name in leg_roots:
    group = mesh.vertex_groups.get(name)
    weighted = sum(1 for vertex in mesh.data.vertices if group and any(item.group == group.index for item in vertex.groups))
    bone = rig.pose.bones[name]
    bone.rotation_mode = "XYZ"
    bone.rotation_euler.z = 0.18 if name.endswith("_L") else -0.18
    bpy.context.view_layer.update()
    displacement = [(after - before).length for before, after in zip(rest, vertices())]
    checks.append({"bone": name, "weightedVertices": weighted, "movedVertices": sum(value > 0.005 for value in displacement), "maxDisplacement": round(max(displacement), 4)})
    bone.rotation_euler.z = 0
    bpy.context.view_layer.update()

passed = all(check["weightedVertices"] > 20 and check["movedVertices"] > 40 and 0.03 < check["maxDisplacement"] < 5 for check in checks)
print(json.dumps({"pass": passed, "checks": checks}))
if not passed:
    raise SystemExit(1)
