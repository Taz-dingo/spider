import bpy
import sys


args = sys.argv[sys.argv.index("--") + 1:]
source, output, ratio = args[0], args[1], float(args[2])

bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=source)
for obj in [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]:
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    modifier = obj.modifiers.new("decimate", "DECIMATE")
    modifier.ratio = ratio
    bpy.ops.object.modifier_apply(modifier=modifier.name)
    obj.select_set(False)

bpy.ops.export_scene.gltf(filepath=output, export_format="GLB")
