import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [sveltekit()],
  server: {
    port: 5001,
    host: true,
    allowedHosts: true,
    // The app writes Test Sequence files under sequences/ (scratch autosave
    // and fixtures). Those live inside the project tree, so the dev watcher
    // would otherwise treat every autosave as a source change and reload the
    // page — wiping the in-memory session a moment after each edit. Ignore
    // the whole sequences/ tree; it is data, never a module.
    watch: { ignored: ["**/apps/visual-tester/sequences/**"] },
  },
  preview: {
    port: 5001,
    host: true,
  },
});
