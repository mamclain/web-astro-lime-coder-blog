import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { visit } from "unist-util-visit";
import sizeOf from "image-size";



/** Parse `{...}` string into { class, style } */
function parseAttrString(raw) {
    const out = { class: [], style: "", attrs: "" };
    const s = raw.trim().replace(/^\{|\}$/g, "").replace(/[“”]/g, '"').replace(/[‘’]/g, "'");

    const parts = s.match(/(?:[^\s"']+|"(?:\\.|[^"])*"|'(?:\\.|[^'])*')+/g) || [];
    for (const part of parts) {
        const clsMatch = part.match(/^class=(?:"([^"]*)"|'([^']*)')$/);
        if (clsMatch) {
            const v = (clsMatch[1] ?? clsMatch[2] ?? "").trim();
            if (v) out.class.push(...v.split(/\s+/));
            continue;
        }
        const stMatch = part.match(/^style=(?:"([^"]*)"|'([^']*)')$/);
        if (stMatch) {
            const v = (stMatch[1] ?? stMatch[2] ?? "").trim();
            if (v) out.style = out.style ? `${out.style}; ${v}` : v;
            continue;
        }
        const attrMatch = part.match(/^attrs=(?:"([^"]*)"|'([^']*)')$/);
        if (attrMatch) {
            const v = (attrMatch[1] ?? attrMatch[2] ?? "").trim();
            if (v) out.attrs = out.attrs ? `${out.attrs}; ${v}` : v;
            continue;
        }
        if (part.startsWith(".")) out.class.push(part.slice(1));
        else out.class.push(part);
    }
    return { class: out.class.join(" ").trim(), style: out.style.trim(), attrs: out.attrs.trim() };
}


export default function remarkMoveLocalAssets(opts = {}) {
    const publicBase   = opts.publicBase   ?? "auto";
    const dedupeMode   = opts.dedupeMode   ?? "global";
    const usageLogPath = opts.usageLogPath ?? path.resolve(".asset-usage.json");
    const videoAttrs   = opts.videoAttrs   ?? "autoplay muted loop playsinline";

    const defaultGetPostId = (vfilePath) => {
        const rootMarker = `${path.sep}src${path.sep}content${path.sep}`;
        const idx = vfilePath.lastIndexOf(rootMarker);
        let rel = idx >= 0 ? vfilePath.slice(idx + rootMarker.length) : path.basename(vfilePath);
        rel = rel.replace(/\.(md|mdx|markdown)$/i, "");
        return rel.replace(/\\/g, "/");
    };
    const getPostId = opts.getPostId ?? defaultGetPostId;

    const IMG_EXTS_FOR_SIZE = new Set([
        ".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp", ".tiff", ".avif",
    ]);

    const sha1File = (absPath) => {
        const hash = crypto.createHash("sha1");
        hash.update(fs.readFileSync(absPath));
        return hash.digest("hex");
    };

    const ensureDir = (dir) => {
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    };

    // Load or init usage log
    let usageData = {};
    if (fs.existsSync(usageLogPath)) {
        try { usageData = JSON.parse(fs.readFileSync(usageLogPath, "utf8")); }
        catch { usageData = {}; }
    }


    return async function transformer(tree, file) {
        const filePath = file.path;
        const postId   = getPostId(filePath);
        const mdDir    = path.dirname(filePath);
        const jobs     = [];


        visit(tree, "paragraph", (para) => {
            const children = para.children || [];
            for (let i = 0; i < children.length; i++) {
                const node = children[i];
                if (node.type !== "image") continue;

                // ---- 1) Gather attrs from existing hProperties + trailing {..} ----
                const hProps = (node.data && node.data.hProperties) || {};
                const existingClass =
                    (hProps.className && Array.isArray(hProps.className)
                            ? hProps.className.join(" ")
                            : hProps.className || hProps.class || ""
                    ).toString().trim();
                let classList = existingClass ? existingClass.split(/\s+/) : [];
                let style = (hProps.style || "").toString().trim();
                let attrs = (hProps.attrs || "").toString().trim();   // NEW: carry any pre-set attrs

                // Trailing "{...}" text node (since remark-attr is OFF)
                if (i + 1 < children.length && children[i + 1].type === "text") {
                    const nextText = children[i + 1].value || "";
                    const m = nextText.match(/^\s*\{[^}]*\}\s*$/);
                    if (m) {
                        const parsed = parseAttrString(nextText);
                        if (parsed.class) classList.push(...parsed.class.split(/\s+/));
                        if (parsed.style) style = style ? `${style}; ${parsed.style}` : parsed.style;
                        if (parsed.attrs) attrs = parsed.attrs;           // NEW: replace attrs if provided
                        children.splice(i + 1, 1); // remove the {..} text node
                    }
                }

                const classStr = Array.from(new Set(classList.filter(Boolean))).join(" ");

                // ---- 2) Resolve / copy / rewrite URL (unchanged) ----
                const url = (node.url || "").trim();
                if (!url || /^https?:\/\//i.test(url) || url.startsWith("/")) {
                    node.data = node.data || {};
                    node.data.hProperties = {
                        ...(node.data.hProperties || {}),
                        ...(classStr ? { class: classStr } : {}),
                        ...(style ? { style } : {}),
                    };
                    continue;
                }

                const absSrc = path.resolve(mdDir, url);
                if (!fs.existsSync(absSrc)) {
                    node.data = node.data || {};
                    node.data.hProperties = {
                        ...(node.data.hProperties || {}),
                        ...(classStr ? { class: classStr } : {}),
                        ...(style ? { style } : {}),
                    };
                    continue;
                }

                const ext = path.extname(absSrc).toLowerCase();
                const sha1 = sha1File(absSrc);
                const hashedName = `${sha1}${ext}`;

                let publicRel, publicAbs;
                if (dedupeMode === "global") {
                    const dir = path.resolve("public", publicBase, "hash");
                    ensureDir(dir);
                    publicAbs = path.resolve(dir, hashedName);
                    publicRel = `/${publicBase}/hash/${hashedName}`;
                } else {
                    const dir = path.resolve("public", publicBase, "images", postId);
                    ensureDir(dir);
                    publicAbs = path.resolve(dir, hashedName);
                    publicRel = `/${publicBase}/images/${postId}/${hashedName}`;
                }

                usageData[sha1] = { ext, lastUsed: new Date().toISOString(), path: publicRel };
                if (!fs.existsSync(publicAbs)) jobs.push(fs.promises.copyFile(absSrc, publicAbs));

                // ---- 3) Emit video or image with attrs ----
                if (ext === ".mp4") {
                    // Prefer provided attrs over default videoAttrs
                    const baseAttrs = attrs || videoAttrs;

                    // Build the open tag safely by joining parts
                    const openParts = ["<video"];
                    if (baseAttrs) openParts.push(baseAttrs);
                    if (classStr) openParts.push(`class="${classStr}"`);
                    if (style) openParts.push(`style="${style}"`);
                    const openTag = openParts.join(" ") + ">";

                    para.children[i] = {
                        type: "html",
                        value: `${openTag}
  <source src="${publicRel}" type="video/mp4">
  Your browser does not support the video tag.
</video>`,
                    };
                    continue;
                }

                // Image: optionally add width/height (CLS)
                let width, height;
                if (IMG_EXTS_FOR_SIZE.has(ext)) {
                    try {
                        const dims = sizeOf(absSrc);
                        width = dims?.width;
                        height = dims?.height;
                    } catch {}
                }

                node.url = publicRel;
                node.data = node.data || {};
                node.data.hProperties = {
                    ...(node.data.hProperties || {}),
                    ...(classStr ? { class: classStr } : {}),
                    ...(style ? { style } : {}),
                    ...(width && height ? { width, height } : {}),
                };
            }
        });

        if (jobs.length) await Promise.all(jobs);
        fs.writeFileSync(usageLogPath, JSON.stringify(usageData, null, 2));
    };
}
