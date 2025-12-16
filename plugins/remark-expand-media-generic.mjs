// remarkExpandMediaGeneric.js
import { visit, SKIP } from "unist-util-visit";

/** parse `{class="..." style="..." attrs="..."}` blocks */
function parseAttrString(raw) {
    const out = { class: [], style: "", attrs: "" };
    const s = raw.trim().replace(/^\{|\}$/g, "").replace(/[“”]/g, '"').replace(/[‘’]/g, "'");
    const parts = s.match(/(?:[^\s"']+|"(?:\\.|[^"])*"|'(?:\\.|[^'])*')+/g) || [];
    for (const part of parts) {
        const mClass = part.match(/^class=(?:"([^"]*)"|'([^']*)')$/);
        if (mClass) { const v = (mClass[1] ?? mClass[2] ?? "").trim(); if (v) out.class.push(...v.split(/\s+/)); continue; }
        const mStyle = part.match(/^style=(?:"([^"]*)"|'([^']*)')$/);
        if (mStyle) { const v = (mStyle[1] ?? mStyle[2] ?? "").trim(); if (v) out.style = out.style ? `${out.style}; ${v}` : v; continue; }
        const mAttrs = part.match(/^attrs=(?:"([^"]*)"|'([^']*)')$/);
        if (mAttrs) { const v = (mAttrs[1] ?? mAttrs[2] ?? "").trim(); if (v) out.attrs = out.attrs ? `${out.attrs} ${v}` : v; continue; }
        if (part.startsWith(".")) out.class.push(part.slice(1)); else out.class.push(part);
    }
    return { class: out.class.join(" ").trim(), style: out.style.trim(), attrs: out.attrs.trim() };
}

/** convert 'controls playsinline foo="bar"' -> {controls:true, playsinline:true, foo:"bar"} */
function parseLooseAttrs(str) {
    const out = {};
    if (!str) return out;
    const parts = str.match(/(?:[^\s"']+|"(?:\\.|[^"])*"|'(?:\\.|[^'])*')+/g) || [];
    for (const p of parts) {
        const m = p.match(/^([^\s=]+)=(?:"([^"]*)"|'([^']*)')$/);
        if (m) out[m[1]] = m[2] ?? m[3] ?? "";
        else out[p] = true; // boolean
    }
    return out;
}

/** legacy: parse attrs in MDX title slot */
function parseTitleAttrs(title) {
    if (!title) return { class: "", style: "", attrs: "" };
    const t = title.trim();
    if (/^\{[^]*\}$/.test(t)) return parseAttrString(t);
    if (/\bclass=|\bstyle=|\battrs=|\s\.[^\s"']|^\.[^\s"']/.test(t)) return parseAttrString(`{${t}}`);
    return { class: "", style: "", attrs: "" };
}

/** derive a readable alt from the URL's filename if none provided */
function deriveAltFromUrl(url) {
    if (!url) return "Image";
    try {
        const file = url.split("?")[0].split("#")[0].split("/").pop() || "";
        const stem = file.replace(/\.[a-z0-9]+$/i, "");
        const human = decodeURIComponent(stem).replace(/[-_]+/g, " ").trim();
        return human || "Image";
    } catch {
        return "Image";
    }
}

/** normalize remark-directive attrs -> {url, alt, classStr, styleStr, extraKV} */
function normalizeDirectiveAttrs(node) {
    const attrs = { ...(node.attributes || {}) };

    const url = attrs.src ? String(attrs.src) : "";
    const alt =
        (node.type === "leafDirective" && node.label) ||
        (typeof attrs.alt === "string" ? attrs.alt : undefined);

    const cls = attrs.className ?? attrs.class ?? "";
    const classStr = Array.isArray(cls) ? cls.join(" ") : String(cls || "").trim();
    delete attrs.class; // prefer className in jsx world
    if (classStr) attrs.className = classStr;

    let styleStr = "";
    if (typeof attrs.style === "string") styleStr = attrs.style.trim();
    else if (attrs.style && typeof attrs.style === "object" && !Array.isArray(attrs.style)) {
        styleStr = Object.entries(attrs.style).map(([k, v]) => `${k}:${v}`).join("; ");
    }
    if (styleStr) attrs.style = styleStr;

    const { src, alt: _alt, ...rest } = attrs;
    return { url, alt, classStr, styleStr, extraKV: rest };
}

/** Build HTML string for <video> (boolean attrs are bare) */
function buildVideoHTML({ src, classStr, styleStr, chosenAttrs }) {
    const open = [
        "<video",
        classStr ? `class="${classStr}"` : null,
        styleStr ? `style="${styleStr}"` : null,
        ...Object.entries(chosenAttrs).map(([k, v]) => (v === true ? k : `${k}="${String(v)}"`)),
    ].filter(Boolean).join(" ") + ">";
    const type = /\.webm$/i.test(src) ? "video/webm" : /\.ogg$/i.test(src) ? "video/ogg" : "video/mp4";
    return `${open}
  <source src="${src}" type="${type}">
  Your browser does not support the video tag.
</video>`;
}

/**
 * remarkExpandMediaGeneric
 * - Consumes :img / :video directives (from mdxAttrsPre + remarkDirective)
 * - Supports legacy Markdown image nodes with trailing `{...}` and MDX-title hacks
 * - Ensures a **non-empty** alt by deriving from filename if missing/empty (needed for Astro <Image>)
 */
export default function remarkExpandMediaGeneric(opts = {}) {
    const defaultVideoAttrs = opts.videoAttrs ?? "controls playsinline muted";

    return function transformer(tree) {
        // A) Handle :img / :video directives BEFORE rehype
        visit(tree, (node, index, parent) => {
            if (!parent || index == null) return;
            if (node.type !== "textDirective" && node.type !== "leafDirective") return;
            if (!node.name || (node.name !== "img" && node.name !== "video")) return;

            const { url, alt, classStr, styleStr, extraKV } = normalizeDirectiveAttrs(node);

            if (node.name === "video") {
                const chosen = Object.keys(extraKV).length ? extraKV : parseLooseAttrs(defaultVideoAttrs);
                parent.children.splice(index, 1, {
                    type: "html",
                    value: buildVideoHTML({ src: url, classStr, styleStr, chosenAttrs: chosen }),
                });
                return SKIP;
            }

            // :img -> standard mdast image with hProperties
            const computedAlt = (typeof alt === "string" && alt.trim() !== "") ? alt : deriveAltFromUrl(url);
            const addlProps = Object.fromEntries(Object.entries(extraKV).map(([k, v]) => [k, v === true ? "" : v]));
            parent.children.splice(index, 1, {
                type: "image",
                url,
                title: null,
                alt: computedAlt,
                data: {
                    hProperties: {
                        alt: computedAlt, // ensure downstream mappers see it
                        ...(classStr ? { class: classStr } : {}),
                        ...(styleStr ? { style: styleStr } : {}),
                        ...addlProps,
                    },
                },
            });
            return SKIP;
        });

        // B) Legacy: Markdown image + trailing {…} (or escaped \{…}) and title hacks
        visit(tree, "paragraph", (para) => {
            const kids = para.children || [];
            for (let i = 0; i < kids.length; i++) {
                const node = kids[i];
                if (node.type !== "image") continue;

                // Ensure non-empty alt for Astro <Image> consumers
                const currentAlt = typeof node.alt === "string" ? node.alt : "";
                const computedAlt = currentAlt.trim() !== "" ? currentAlt : deriveAltFromUrl(node.url || "");
                node.alt = computedAlt;

                // existing props
                const h = (node.data && node.data.hProperties) || {};
                const existingClass = (
                    (Array.isArray(h.className) ? h.className.join(" ") : h.className || h.class || "") || ""
                ).toString().trim();
                let classList = existingClass ? existingClass.split(/\s+/) : [];
                let style = (h.style || "").toString().trim();
                let extra = "";

                // MDX title slot attrs (legacy)
                if (typeof node.title === "string" && node.title.trim()) {
                    const parsed = parseTitleAttrs(node.title);
                    if (parsed.class) classList.push(...parsed.class.split(/\s+/));
                    if (parsed.style) style = style ? `${style}; ${parsed.style}` : parsed.style;
                    if (parsed.attrs) extra = extra ? `${extra} ${parsed.attrs}` : parsed.attrs;
                    if (parsed.class || parsed.style || parsed.attrs) node.title = null; // prevent tooltip
                }

                // trailing {…} or \{…}
                if (i + 1 < kids.length && kids[i + 1].type === "text") {
                    const t = kids[i + 1].value || "";
                    if (/^\s*\{[^}]*\}\s*$/.test(t) || /^\s*\\\{[^}]*\}\s*$/.test(t)) {
                        const asText = t.replace(/^\s*\\?(\{[^}]*\})\s*$/, "$1");
                        const parsed = parseAttrString(asText);
                        if (parsed.class) classList.push(...parsed.class.split(/\s+/));
                        if (parsed.style) style = style ? `${style}; ${parsed.style}` : parsed.style;
                        if (parsed.attrs) extra = extra ? `${extra} ${parsed.attrs}` : parsed.attrs;
                        kids.splice(i + 1, 1);
                    }
                }

                const classStr = Array.from(new Set(classList.filter(Boolean))).join(" ");
                const mediaMeta = (node.data && node.data.media) || {};
                const isVideo = mediaMeta.kind === "video" || /\.(mp4|webm|ogg)$/i.test(node.url);

                if (isVideo) {
                    const chosen = extra.trim() ? parseLooseAttrs(extra) : parseLooseAttrs(defaultVideoAttrs);
                    kids[i] = {
                        type: "html",
                        value: buildVideoHTML({ src: node.url, classStr, styleStr: style, chosenAttrs: chosen }),
                    };
                    continue;
                }

                // image: apply hProperties (also set alt here)
                const kv = parseLooseAttrs(extra);
                const addlProps = Object.fromEntries(Object.entries(kv).map(([k, v]) => [k, v === true ? "" : v]));
                node.data = node.data || {};
                node.data.hProperties = {
                    ...(node.data.hProperties || {}),
                    alt: computedAlt,
                    ...(classStr ? { class: classStr } : {}),
                    ...(style ? { style } : {}),
                    ...(mediaMeta.width && mediaMeta.height ? { width: mediaMeta.width, height: mediaMeta.height } : {}),
                    ...addlProps,
                };
            }
        });
    };
}
