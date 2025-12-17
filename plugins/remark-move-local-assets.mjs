// plugins/remark-move-local-assets.mjs
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { visit } from "unist-util-visit";
import sizeOf from "image-size";

/**
 * remarkMoveLocalAssets v2
 * - Processes:
 *    • Markdown images:        ![alt](book.png class="" style="" attrs="")
 *    • Frontmatter image:      image: book.png
 *    • MDX/JSX components:     <Media src="img_32.png" ... />
 * - Rewrites to hashed files under /public and annotates nodes with media metadata.
 */
export default function remarkMoveLocalAssets(opts = {}) {
    const publicBase   = opts.publicBase   ?? "assets";
    const dedupeMode   = opts.dedupeMode   ?? "global"; // "global" | "perPost"
    const usageLogPath = opts.usageLogPath ?? path.resolve(".asset-usage.json");

    const IMG_FOR_SIZE = new Set([".png",".jpg",".jpeg",".webp",".gif",".bmp",".tiff",".avif"]);
    const VIDEO_EXTS   = new Set([".mp4",".webm",".ogg"]);
    const ALL_EXTS     = new Set([...IMG_FOR_SIZE, ...VIDEO_EXTS]);

    const defaultGetPostId = (vfilePath) => {
        const rootMarker = `${path.sep}src${path.sep}content${path.sep}`;
        const i = vfilePath.lastIndexOf(rootMarker);
        let rel = i >= 0 ? vfilePath.slice(i + rootMarker.length) : path.basename(vfilePath);

        rel = rel.replace(/\.(md|mdx|markdown)$/i, "");
        return rel.replace(/\\/g, "/");
    };
    const getPostId = opts.getPostId ?? defaultGetPostId;

    const sha1File  = (abs) => crypto.createHash("sha1").update(fs.readFileSync(abs)).digest("hex");
    const ensureDir = (dir) => { if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true }); };

    // usage log (optional)
    let usage = {};
    if (fs.existsSync(usageLogPath)) {
        try { usage = JSON.parse(fs.readFileSync(usageLogPath, "utf8")); } catch {}
    }

    // ---- helpers --------------------------------------------------------------

    // Extract a local file path from a possibly “decorated” URL like:
    // "book.png class="" style="" attrs="""  → "book.png"
    // Also strip surrounding <...>.
    function extractLocalPath(rawUrl) {
        if (!rawUrl) return null;
        let s = rawUrl.trim();

        // Angle-bracketed URL form <...> (CommonMark)
        if (s.startsWith("<") && s.endsWith(">")) s = s.slice(1, -1).trim();

        // If absolute (/, http, https), skip
        if (/^(https?:)?\/\//i.test(s) || s.startsWith("/")) return null;

        // If it looks like a single path with a known extension and no spaces → done
        const ext = path.extname(s).toLowerCase();
        if (ALL_EXTS.has(ext) && !/\s/.test(s)) return s;

        // Otherwise, grab the first token that looks like a filename with a known extension
        const m = s.match(/([^\s"'()<>]+?\.(?:png|jpe?g|webp|gif|bmp|tiff|avif|mp4|webm|ogg))/i);
        return m ? m[1] : null;
    }

    // Copy + rewrite to hashed public path, return { publicRel, ext, width, height, kind }
    function processOneLocal(absSrc, postId) {
        const ext  = path.extname(absSrc).toLowerCase();
        const hash = sha1File(absSrc);
        const name = `${hash}${ext}`;

        let outDir, publicRel;
        if (dedupeMode === "global") {
            outDir   = path.resolve("public", publicBase, "hash");
            publicRel = `/${publicBase}/hash/${name}`;
        } else {
            outDir   = path.resolve("public", publicBase, "images", postId);
            publicRel = `/${publicBase}/images/${postId}/${name}`;
        }
        ensureDir(outDir);
        const outAbs = path.resolve(outDir, name);

        usage[hash] = { ext, path: publicRel, lastUsed: new Date().toISOString() };
        if (!fs.existsSync(outAbs)) {
            // Copy synchronous for deterministic behavior in rare builders, we still await jobs overall below
            fs.copyFileSync(absSrc, outAbs);
        }

        let width, height;
        if (IMG_FOR_SIZE.has(ext)) {
            try {
                const d = sizeOf(absSrc);
                width = d?.width; height = d?.height;
            } catch {}
        }
        return {
            publicRel,
            ext,
            width,
            height,
            kind: VIDEO_EXTS.has(ext) ? "video" : "image",
        };
    }

    // Rewrite a local path (relative to mdDir) → hashed + return meta (or null if not local)
    function rewriteLocal(relOrRaw, mdDir, postId) {
        const rel = extractLocalPath(relOrRaw);
        if (!rel) return null;
        const absSrc = path.resolve(mdDir, rel);
        if (!fs.existsSync(absSrc)) return null;
        return processOneLocal(absSrc, postId);
    }

    // Modify/attach media metadata on a mdast image node
    function attachMediaToImageNode(node, meta) {
        if (!meta) return;
        node.url = meta.publicRel;
        node.data = node.data || {};
        node.data.media = { kind: meta.kind, ext: meta.ext, width: meta.width, height: meta.height };
    }

    // ---- main transformer -----------------------------------------------------

    return async (tree, file) => {
        const mdDir  = path.dirname(file.path);
        const postId = getPostId(file.path);

        // 1) Frontmatter: file.data.astro is provided by Astro’s remark pipeline
        const fm = file?.data?.astro?.frontmatter;
        if (fm && typeof fm.image === "string") {
            const meta = rewriteLocal(fm.image, mdDir, postId);
            if (meta) {
                // Mutate frontmatter in-place so subsequent steps (and your code) see the hashed path
                fm.image = meta.publicRel;
            }
        }

        // 1.5) remark-directive nodes (:img / :video)
        visit(tree, (node) =>
                (node.type === "leafDirective" || node.type === "textDirective") &&
                (node.name === "img" || node.name === "video"),
            (node) => {
                const attrs = node.attributes || {};
                if (typeof attrs.src !== "string") return;

                const meta = rewriteLocal(attrs.src, mdDir, postId);
                if (!meta) return;

                // mutate directive src in-place so downstream remarkExpandMediaGeneric sees it
                attrs.src = meta.publicRel;
                node.attributes = attrs;

                // optional: keep media hint around (your expand plugin also checks node.data?.media)
                node.data = node.data || {};
                node.data.media = { kind: meta.kind, ext: meta.ext, width: meta.width, height: meta.height };
            });

        // 2) Markdown images (including “URL + attrs” forms)
        visit(tree, "image", (node) => {
            const meta = rewriteLocal(node.url, mdDir, postId);
            if (meta) attachMediaToImageNode(node, meta);
            // If node.title happened to contain something, we just ignore it here on purpose;
            // your *other* plugin can consume class/style/attrs from title or elsewhere.
        });

        // 3) MDX/JSX components: <Media src="foo.png" ...>, <img src="..."/>, <Image .../>
        //    Covers both flow & text variants
        const jsxNodeTypes = ["mdxJsxFlowElement", "mdxJsxTextElement"];
        visit(tree, (node) => jsxNodeTypes.includes(node.type), (node) => {
            const attrs = Array.isArray(node.attributes) ? node.attributes : [];
            if (!attrs.length) return;

            // find src attribute
            let srcAttr = null;
            for (const a of attrs) {
                if (a && a.type === "mdxJsxAttribute" && a.name === "src") {
                    srcAttr = a;
                    break;
                }
            }
            if (!srcAttr) return;

            // read raw src (supports src="foo.png" and src={"foo.png"})
            let rawSrc = null;
            if (typeof srcAttr.value === "string") {
                rawSrc = srcAttr.value;
            } else if (
                srcAttr.value &&
                typeof srcAttr.value === "object" &&
                srcAttr.value.type === "mdxJsxAttributeValueExpression" &&
                typeof srcAttr.value.value === "string"
            ) {
                // mdx gives the JS expression as a string; accept simple string literal
                const m = srcAttr.value.value.trim().match(/^['"]([^'"]+)['"]$/);
                if (m) rawSrc = m[1];
            }
            if (!rawSrc) return;

            const meta = rewriteLocal(rawSrc, mdDir, postId);
            if (!meta) return;

            // write back hashed src
            srcAttr.value = meta.publicRel;

            // annotate node with media meta
            node.data = node.data || {};
            node.data.media = { kind: meta.kind, ext: meta.ext, width: meta.width, height: meta.height };

            // add width/height if not present and we have dimensions
            const hasW = attrs.some((a) => a.type === "mdxJsxAttribute" && a.name === "width");
            const hasH = attrs.some((a) => a.type === "mdxJsxAttribute" && a.name === "height");
            if (meta.kind === "image" && meta.width && meta.height && !hasW && !hasH) {
                attrs.push({ type: "mdxJsxAttribute", name: "width", value: String(meta.width) });
                attrs.push({ type: "mdxJsxAttribute", name: "height", value: String(meta.height) });
            }
        });

        // persist usage log
        fs.writeFileSync(usageLogPath, JSON.stringify(usage, null, 2));
    };
}