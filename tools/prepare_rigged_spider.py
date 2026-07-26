import bpy
import sys

source, texture_path, output = sys.argv[sys.argv.index("--") + 1:]
bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.fbx(filepath=source)

mesh = bpy.data.objects["Spider"]
texture = bpy.data.images.load(texture_path, check_existing=True)
for slot in mesh.material_slots:
    material = slot.material
    if not material or not material.use_nodes:
        continue
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    shader = next((node for node in nodes if node.type == "BSDF_PRINCIPLED"), None)
    if not shader:
        continue
    image_node = nodes.new("ShaderNodeTexImage")
    image_node.image = texture
    links.new(image_node.outputs["Color"], shader.inputs["Base Color"])
    shader.inputs["Roughness"].default_value = 0.72

bpy.ops.export_scene.gltf(filepath=output, export_format="GLB", export_animations=True)
