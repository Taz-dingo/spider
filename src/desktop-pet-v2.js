// Desktop Topology v2 page adapter.
//
// The simulation remains in one global desktop/world coordinate system, while
// the native host moves a small transparent window with the spider.  Keep the
// camera centred on the spider and publish its world pose to the host after
// each actual render. Browser/self-test mode is unchanged.

if (petMode) {
  const nativeRendererRender = renderer.render.bind(renderer);

  function centrePetCamera() {
    camera.up.set(0, 0, -1);
    camera.position.set(spider.position.x, 1200, spider.position.z + 700);
    camera.lookAt(spider.position.x, 0, spider.position.z);
    camera.updateMatrixWorld();
  }

  function publishPetPose() {
    window.__petPublishedPose = { x: spider.position.x, z: spider.position.z };
    const handler = window.webkit?.messageHandlers?.petPose;
    if (handler) handler.postMessage(window.__petPublishedPose);
  }

  // renderer.render is the final point after body/gait/IK have updated the
  // current frame. Re-centre only for desktop-pet rendering, then send the
  // exact pose that was just drawn to the native shell.
  renderer.render = (sceneArg, cameraArg) => {
    centrePetCamera();
    nativeRendererRender(sceneArg, cameraArg);
    publishPetPose();
  };

  // The render viewport is the small native pet window, NOT the full desktop.
  // __petFrame continues to describe desktop world bounds for cursor/idle
  // logic, so it must never size the WebGL surface in pet mode.
  resize = () => {
    const width = innerWidth, height = innerHeight;
    renderer.setSize(width, height, false);
    camera.left = -width / 2;
    camera.right = width / 2;
    camera.top = height / 2;
    camera.bottom = -height / 2;
    camera.near = .1;
    camera.far = 2000;
    centrePetCamera();
    camera.updateProjectionMatrix();
  };
}
