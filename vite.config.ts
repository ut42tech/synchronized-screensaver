import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import fs from "fs";
import path from "path";

/**
 * Vite plugin that serves a JSON directory listing for /videos/,
 * mimicking nginx autoindex_format json in development.
 */
function videoDirListing() {
  return {
    name: "video-dir-listing",
    configureServer(server: { middlewares: { use: Function } }) {
      server.middlewares.use((req: any, res: any, next: Function) => {
        if (req.url !== "/videos/" && req.url !== "/videos") return next();

        const videosDir = path.resolve(__dirname, "public/videos");
        if (!fs.existsSync(videosDir)) {
          res.statusCode = 200;
          res.setHeader("Content-Type", "application/json");
          res.end("[]");
          return;
        }

        const entries = fs
          .readdirSync(videosDir, { withFileTypes: true })
          .map((d) => ({
            name: d.name,
            type: d.isDirectory() ? "directory" : "file",
          }));

        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify(entries));
      });
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [videoDirListing(), svelte()],
  build: {
    target: "safari15",
    cssMinify: true,
  },
});
