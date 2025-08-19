import { visit } from "unist-util-visit";

/** parse `{class="..." style="..." attrs="..."}` */
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
        if (part.startsWith(".")) out.class.push(part.slice(1));
        else out.class.push(part);
    }
    return { class: out.class.join(" ").trim(), style: out.style.trim(), attrs: out.attrs.trim() };
}

/** convert 'controls playsinline foo="bar"' -> object {controls:true, playsinline:true, foo:"bar"} */
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

export default function remarkExpandMediaGeneric(opts = {}) {
    const defaultVideoAttrs = opts.videoAttrs ?? "controls playsinline muted";

    return function transformer(tree) {
        visit(tree, "paragraph", (para) => {
            const kids = para.children || [];
            for (let i = 0; i < kids.length; i++) {
                const node = kids[i];
                if (node.type !== "image") continue;

                // collect existing props
                const h = (node.data && node.data.hProperties) || {};
                const existingClass =
                    (h.className && Array.isArray(h.className) ? h.className.join(" ")
                        : h.className || h.class || "").toString().trim();
                let classList = existingClass ? existingClass.split(/\s+/) : [];
                let style = (h.style || "").toString().trim();
                let extra = ""; // "controls playsinline" etc.

                // pull trailing "{...}" token after the image
                if (i + 1 < kids.length && kids[i + 1].type === "text") {
                    const t = kids[i + 1].value || "";
                    if (/^\s*\{[^}]*\}\s*$/.test(t)) {
                        const parsed = parseAttrString(t);
                        if (parsed.class) classList.push(...parsed.class.split(/\s+/));
                        if (parsed.style) style = style ? `${style}; ${parsed.style}` : parsed.style;
                        if (parsed.attrs) extra = parsed.attrs;
                        kids.splice(i + 1, 1);
                    }
                }

                const classStr = Array.from(new Set(classList.filter(Boolean))).join(" ");
                const mediaMeta = (node.data && node.data.media) || {};
                const isVideo = mediaMeta.kind === "video" || /\.(mp4|webm|ogg)$/i.test(node.url);

                if (isVideo) {
                    // Prefer explicit attrs from Markdown over defaults
                    const chosen = (extra && extra.trim().length > 0)
                        ? parseLooseAttrs(extra)
                        : parseLooseAttrs(defaultVideoAttrs);

                    // Build <video ...> with proper boolean attributes (no ="")
                    const openParts = ["<video"];
                    if (classStr) openParts.push(`class="${classStr}"`);
                    if (style)    openParts.push(`style="${style}"`);
                    for (const [k, v] of Object.entries(chosen)) {
                        if (v === true) openParts.push(k);           // boolean: bare
                        else openParts.push(`${k}="${String(v)}"`);  // keyed
                    }
                    const open = openParts.join(" ") + ">";

                    const type = /\.webm$/i.test(node.url) ? "video/webm"
                        : /\.ogg$/i.test(node.url)  ? "video/ogg"
                            : "video/mp4";

                    kids[i] = {
                        type: "html",
                        value: `${open}
  <source src="${node.url}" type="${type}">
  Your browser does not support the video tag.
</video>`,
                    };
                    continue;
                }

                // Image: set hProperties; keep node as <img>
                const kv = parseLooseAttrs(extra);
                const addlProps = Object.fromEntries(Object.entries(kv).map(([k, v]) => [k, v === true ? "" : v]));
                node.data = node.data || {};
                node.data.hProperties = {
                    ...(node.data.hProperties || {}),
                    ...(classStr ? { class: classStr } : {}),
                    ...(style ? { style } : {}),
                    ...(mediaMeta.width && mediaMeta.height ? { width: mediaMeta.width, height: mediaMeta.height } : {}),
                    ...addlProps, // allow arbitrary attributes on <img> (e.g., loading="lazy")
                };
            }
        });
    };
}