import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { visit } from "unist-util-visit";
import sizeOf from "image-size";

export default function remarkMoveLocalAssets(opts = {}) {
    const publicBase   = opts.publicBase   ?? "assets";
    const dedupeMode   = opts.dedupeMode   ?? "global"; // "global" | "perPost"
    const usageLogPath = opts.usageLogPath ?? path.resolve(".asset-usage.json");

    const IMG_FOR_SIZE = new Set([".png",".jpg",".jpeg",".webp",".gif",".bmp",".tiff",".avif"]);
    const VIDEO_EXTS   = new Set([".mp4",".webm",".ogg"]);

    const defaultGetPostId = (vfilePath) => {
        const rootMarker = `${path.sep}src${path.sep}content${path.sep}`;
        const i = vfilePath.lastIndexOf(rootMarker);
        let rel = i >= 0 ? vfilePath.slice(i + rootMarker.length) : path.basename(vfilePath);
        rel = rel.replace(/\.(md|mdx|markdown)$/i, "");
        return rel.replace(/\\/g, "/");
    };
    const getPostId = opts.getPostId ?? defaultGetPostId;

    const sha1File = (abs) => crypto.createHash("sha1").update(fs.readFileSync(abs)).digest("hex");
    const ensureDir = (dir) => { if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true }); };

    // load usage log (optional)
    let usage = {};
    if (fs.existsSync(usageLogPath)) {
        try { usage = JSON.parse(fs.readFileSync(usageLogPath, "utf8")); } catch {}
    }

    return async (tree, file) => {
        const mdDir = path.dirname(file.path);
        const postId = getPostId(file.path);
        const copyJobs = [];

        visit(tree, "image", (node) => {
            const raw = (node.url || "").trim();
            if (!raw || /^https?:\/\//i.test(raw) || raw.startsWith("/")) return;

            const absSrc = path.resolve(mdDir, raw);
            if (!fs.existsSync(absSrc)) return;

            const ext  = path.extname(absSrc).toLowerCase();
            const hash = sha1File(absSrc);
            const name = `${hash}${ext}`;

            let outDir, publicRel;
            if (dedupeMode === "global") {
                outDir = path.resolve("public", publicBase, "hash");
                publicRel = `/${publicBase}/hash/${name}`;
            } else {
                outDir = path.resolve("public", publicBase, "images", postId);
                publicRel = `/${publicBase}/images/${postId}/${name}`;
            }
            ensureDir(outDir);
            const outAbs = path.resolve(outDir, name);

            usage[hash] = { ext, path: publicRel, lastUsed: new Date().toISOString() };
            if (!fs.existsSync(outAbs)) copyJobs.push(fs.promises.copyFile(absSrc, outAbs));

            // rewrite URL
            node.url = publicRel;

            // annotate
            let width, height;
            if (IMG_FOR_SIZE.has(ext)) {
                try { const d = sizeOf(absSrc); width = d?.width; height = d?.height; } catch {}
            }
            node.data = node.data || {};
            node.data.media = {
                kind: VIDEO_EXTS.has(ext) ? "video" : "image",
                ext, width, height,
            };
        });

        if (copyJobs.length) await Promise.all(copyJobs);
        fs.writeFileSync(usageLogPath, JSON.stringify(usage, null, 2));
    };
}