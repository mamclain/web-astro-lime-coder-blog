// plugins/remark-move-local-assets.js
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { visit } from "unist-util-visit";
import sizeOf from "image-size";

export default function remarkMoveLocalAssets(opts = {
    publicBase: undefined,
    dedupeMode: undefined,
    usageLogPath: undefined,
    videoAttrs: undefined,
    getPostId: undefined
}) {
    const publicBase = opts.publicBase ?? "auto";
    const dedupeMode = opts.dedupeMode ?? "global";
    const usageLogPath = opts.usageLogPath ?? path.resolve(".asset-usage.json");
    const videoAttrs = opts.videoAttrs ?? "autoplay muted loop playsinline";

    const defaultGetPostId = (vfilePath) => {
        const rootMarker = `${path.sep}src${path.sep}content${path.sep}`;
        const idx = vfilePath.lastIndexOf(rootMarker);
        let rel = idx >= 0 ? vfilePath.slice(idx + rootMarker.length) : path.basename(vfilePath);
        rel = rel.replace(/\.(md|mdx|markdown)$/i, "");
        return rel.replace(/\\/g, "/");
    };
    const getPostId = opts.getPostId ?? defaultGetPostId;

    const IMG_EXTS_FOR_SIZE = new Set([
        ".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp", ".tiff", ".avif"
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
        try {
            usageData = JSON.parse(fs.readFileSync(usageLogPath, "utf8"));
        } catch {
            usageData = {};
        }
    }

    return async function transformer(tree, file) {
        const filePath = file.path;
        const postId = getPostId(filePath);
        const mdDir = path.dirname(filePath);

        const jobs = [];

        visit(tree, (node) => node.type === "image", (node) => {
            const url = (node.url || "").trim();
            if (!url || /^https?:\/\//i.test(url) || url.startsWith("/")) return;

            const absSrc = path.resolve(mdDir, url);
            if (!fs.existsSync(absSrc)) return;

            const ext = path.extname(absSrc).toLowerCase();
            const sha1 = sha1File(absSrc);
            const hashedName = `${sha1}${ext}`;

            let publicRel;
            let publicAbs;
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

            // Log hash usage for cleanup later
            usageData[sha1] = {
                ext,
                lastUsed: new Date().toISOString(),
                path: publicRel
            };

            // Only copy if file doesn't exist already
            if (!fs.existsSync(publicAbs)) {
                jobs.push(fs.promises.copyFile(absSrc, publicAbs));
            }

            const props = (node.data && node.data.hProperties) || {};
            const cls = (props.class || props.className || "").trim();
            const style = (props.style || "").trim();

            if (ext === ".mp4") {
                node.type = "html";
                const classAttr = cls ? ` class="${cls}"` : "";
                const styleAttr = style ? ` style="${style}"` : "";
                node.value = `<video ${videoAttrs}${classAttr}${styleAttr}>
  <source src="${publicRel}" type="video/mp4">
  Your browser does not support the video tag.
</video>`;
                delete node.url;
                delete node.alt;
                return;
            }

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
                ...(cls ? { class: cls } : {}),
                ...(style ? { style } : {}),
                ...(width && height ? { width, height } : {}),
            };
        });

        if (jobs.length) await Promise.all(jobs);

        // Save usage log back to disk
        fs.writeFileSync(usageLogPath, JSON.stringify(usageData, null, 2));
    };
}