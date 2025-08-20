import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import solidJs from '@astrojs/solid-js';
import remarkDirective from "remark-directive";
import remarkMoveLocalAssets from "./plugins/remark-move-local-assets.mjs";
import remarkExpandMediaGeneric from "./plugins/remark-expand-media-generic.mjs";
import mdx from "@astrojs/mdx";


// one source of truth for your remark plugins + options
const remarkStack = [
    remarkDirective,
    [remarkMoveLocalAssets, { publicBase: 'auto', dedupeMode: 'global' }],
    [remarkExpandMediaGeneric, { videoAttrs: 'controls playsinline muted' }],
];


export default defineConfig({
    outDir: './dist',

    // Applies to .md (and some .mdx cases inside markdown pipeline),
    // but don't rely on this alone for MDX files
    markdown: {
        shikiConfig: { theme: 'dracula' },
        remarkPlugins: remarkStack,
    },

    // Applies to content collections (src/content/**) for .md and .mdx entries
    content: {
        remarkPlugins: remarkStack,
    },

    // MDX pages/components (.mdx) need plugins passed via the MDX integration:
    integrations: [
        solidJs(),
        mdx({
            remarkPlugins: remarkStack,
            // If you also need rehype plugins for both, add rehypePlugins here too
        }),
    ],

    vite: {
        plugins: [tailwindcss(), solidJs()],
    },
});