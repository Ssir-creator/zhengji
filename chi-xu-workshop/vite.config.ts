import { defineConfig } from "vite";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
export default defineConfig({
  plugins: [
    {
      name: "chixu-local-instance",
      configureServer(server) {
        const identity = {
          app: "chi-xu-workshop",
          installation: createHash("sha256")
            .update(resolve(server.config.root))
            .digest("hex"),
        };
        server.middlewares.use("/__chixu_instance", (_req, res) => {
          res.setHeader("Content-Type", "application/json");
          res.setHeader("Cache-Control", "no-store");
          res.end(JSON.stringify(identity));
        });
      },
    },
  ],
});
