// Zero-dependency static file server for the browser test suite.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize, sep } from "node:path";

const MIME = {
  ".html": "text/html", ".js": "text/javascript", ".css": "text/css",
  ".glb": "model/gltf-binary", ".json": "application/json",
};

export function serve(root) {
  return createServer(async (req, res) => {
    try {
      const url = new URL(req.url, "http://localhost");
      const path = normalize(join(root, url.pathname === "/" ? "index.html" : url.pathname));
      if (path !== root && !path.startsWith(root + sep)) { res.writeHead(403); res.end(); return; }
      const data = await readFile(path);
      res.writeHead(200, { "content-type": MIME[extname(path)] || "application/octet-stream" });
      res.end(data);
    } catch {
      res.writeHead(404); res.end();
    }
  });
}
