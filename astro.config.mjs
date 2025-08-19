import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import solidJs from '@astrojs/solid-js';
import remarkDirective from "remark-directive";
import remarkMoveLocalAssets from "./plugins/remark-move-local-assets.mjs";
import remarkExpandMediaGeneric from "./plugins/remark-expand-media-generic.mjs";



export default defineConfig({
    outDir: './dist',
    markdown: {
        shikiConfig: { theme: "dracula" },
        remarkPlugins: [
            [remarkMoveLocalAssets, { publicBase: "auto", dedupeMode: "global" }],
            [remarkExpandMediaGeneric, { videoAttrs: "controls playsinline muted" }],
            // remarkDirective,
        ],
    },
    content: {
        remarkPlugins: [
            [remarkMoveLocalAssets, { publicBase: "auto", dedupeMode: "global" }],
            [remarkExpandMediaGeneric, { videoAttrs: "controls playsinline muted" }],
            // remarkDirective,
        ],
    },
    vite: {
      plugins: [tailwindcss(),solidJs()]
    },
    integrations: [solidJs()],
});