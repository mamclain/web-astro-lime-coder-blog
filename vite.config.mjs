import tailwind from 'tailwindcss';
import autoprefixer from 'autoprefixer';

export default {
    css: {
        postcss: {
            plugins: [tailwind, autoprefixer],
        },
    },
};
