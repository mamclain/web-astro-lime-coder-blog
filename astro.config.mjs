import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import solidJs from '@astrojs/solid-js';
import remarkDirective from "remark-directive";
import moveLocalAssets from "./plugins/remark-move-local-assets.js";

export default defineConfig({
    outDir: './dist',
    markdown: {
        shikiConfig: { theme: "dracula" },
        remarkPlugins: [
            remarkDirective,
            [moveLocalAssets, {
                // optional: customize base folder or post id derivation
                // publicBase: "assets/auto/images",
                // getPostId: (vfilePath) => { ... }
            }],
        ],
    },
    vite: {
      plugins: [tailwindcss(),solidJs()]
    },
    integrations: [solidJs()],
});