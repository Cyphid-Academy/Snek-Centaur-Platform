import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";

// A plain Svelte 5 library, not a SvelteKit app: no `kit` section, and the one
// thing `svelte-package` needs from here is the preprocessor that strips the
// `lang="ts"` out of the components before they are published to `dist/`.
export default {
  preprocess: vitePreprocess(),
};
