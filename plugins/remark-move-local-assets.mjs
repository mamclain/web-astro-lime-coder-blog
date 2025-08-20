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

        // 2) Markdown images (including “URL + attrs” forms)
        visit(tree, "image", (node) => {
            const meta = rewriteLocal(node.url, mdDir, postId);
            if (meta) attachMediaToImageNode(node, meta);
            // If node.title happened to contain something, we just ignore it here on purpose;
            // your *other* plugin can consume class/style/attrs from title or elsewhere.
        });

        // 3) MDX/JSX components: <Media src="foo.png" ...>, <img src="..."/>, <Image .../>
        //    Covers both flow & text variants
        const jsxTypes = new Set(["mdxJsxFlowElement", "mdxJsxTextElement"]);
        visit(tree, (node) => jsxTypes.has(node.type), (node) => {
            // Only handle if there is a string 'src' attribute
            const props = node.attributes?.reduce?.((acc, a) => {
                if (a && a.type === "mdxJsxAttribute" && typeof a.name === "string") {
                    acc[a.name] = a.value;
                }
                return acc;
            }, {}) ?? null;

            if (!props) return;
            const rawSrc = typeof props.src === "string" ? props.src : null;
            if (!rawSrc) return;

            const meta = rewriteLocal(rawSrc, mdDir, postId);
            if (!meta) return;

            // Write the new src back
            for (const a of node.attributes) {
                if (a.type === "mdxJsxAttribute" && a.name === "src") {
                    a.value = meta.publicRel;
                    break;
                }
            }

            // Optionally attach width/height if not present and it’s an <img> or similar
            const wantsDims = !("width" in props) && !("height" in props) && meta.width && meta.height;
            if (wantsDims) {
                node.attributes.push({ type: "mdxJsxAttribute", name: "width",  value: String(meta.width) });
                node.attributes.push({ type: "mdxJsxAttribute", name: "height", value: String(meta.height) });
            }
        });

        // persist usage log
        fs.writeFileSync(usageLogPath, JSON.stringify(usage, null, 2));
    };
}