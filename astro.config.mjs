import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import solidJs from '@astrojs/solid-js';



export default defineConfig({
    outDir: './dist',
    markdown: { shikiConfig: { theme: "dracula" } },
    vite: {
      plugins: [tailwindcss(),solidJs()]
    },
    integrations: [solidJs()],
});