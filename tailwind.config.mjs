import typography from "@tailwindcss/typography";

export default {
    content: [
        "./src/**/*.{astro,js,ts,jsx,tsx,mdx,md}", // adjust to your project
    ],
    theme: {
        extend: {
            typography: (theme) => ({
                invert: {
                    css: {
                        color: theme("colors.gray.200"),
                        a: {
                            color: theme("colors.lime.400"),
                            "text-decoration": "none",
                            "font-weight": "500",
                            "&:hover": {
                                color: theme("colors.lime.300"),
                                "text-decoration": "underline",
                            },
                        },
                        h1: { color: theme("colors.white") },
                        h2: { color: theme("colors.white") },
                        h3: { color: theme("colors.white") },
                        strong: { color: theme("colors.white") },
                        p: { "margin-top": "1em", "margin-bottom": "1em", "line-height": "1.7" },
                        ul: { "margin-top": "1em", "margin-bottom": "1em" },
                        ol: { "margin-top": "1em", "margin-bottom": "1em" },
                        blockquote: {
                            color: theme("colors.gray.300"),
                            borderLeftColor: theme("colors.lime.500"),
                        },
                        code: { color: theme("colors.pink.400"), "font-weight": "500" },
                    },
                },
            }),
        },
    },
    plugins: [typography],
};