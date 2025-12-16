export default function mdxAttrsPre() {
    const RE = /!\[([^\]]*)\]\(([^)\s]+)\)\s*\{([^}]*)\}/g;
    return {
        name: "mdx-attrs-pre",
        enforce: "pre",               // run before MDX loader
        transform(code, id) {
            if (!id.endsWith(".mdx")) return null;
            // Convert to a directive the remark-directive plugin can handle
            return code.replace(RE, (_m, alt, url, attrs) =>
                `:img[${alt}]{src="${url}" ${attrs}}`
            );
        },
    };
}