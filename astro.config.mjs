import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import solidJs from '@astrojs/solid-js';
import remarkDirective from "remark-directive";
import remarkMoveLocalAssets  from "./plugins/remark-move-local-assets.js";
// import remarkAttr from 'remark-attr';

export default defineConfig({
    outDir: './dist',
    markdown: {
        shikiConfig: { theme: "dracula" },
        remarkPlugins: [
            // remarkDirective,
            // [remarkAttr, { allowDangerousDOMEventHandlers: true, elements: ['image','link'] }],
            [remarkMoveLocalAssets, {
                // publicBase: 'assets',
                // dedupeMode: 'global',
                // usageLogPath: '.asset-usage.json',
                // videoAttrs: 'autoplay muted loop playsinline',
            }],
        ],
    },
    content: {
        remarkPlugins: [
            // [remarkAttr, { allowDangerousDOMEventHandlers: true, elements: ["image","link"] }],
            remarkMoveLocalAssets,
        ],
    },
    vite: {
      plugins: [tailwindcss(),solidJs()]
    },
    integrations: [solidJs()],
});