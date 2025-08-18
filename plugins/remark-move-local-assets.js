import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { visit } from "unist-util-visit";
import sizeOf from "image-size";



/** Parse `{...}` string into { class, style } */
function parseAttrString(raw) {
    // raw is like: `{foo bar .baz style="color:red" class="x y"}`
    const out = { class: [], style: "" };
    // strip outer braces
    const s = raw.trim().replace(/^\{|\}$/g, "");
    // very light tokenizer: split on spaces that are not inside quotes
    const parts = s.match(/(?:[^\s"']+|"(?:\\.|[^"])*"|'(?:\\.|[^'])*')+/g) || [];
    for (const part of parts) {
        // class="..."
        const clsMatch = part.match(/^class=(?:"([^"]*)"|'([^']*)')$/);
        if (clsMatch) {
            const v = (clsMatch[1] ?? clsMatch[2] ?? "").trim();
            if (v) out.class.push(...v.split(/\s+/));
            continue;
        }
        // style="..."
        const stMatch = part.match(/^style=(?:"([^"]*)"|'([^']*)')$/);
        if (stMatch) {
            const v = (stMatch[1] ?? stMatch[2] ?? "").trim();
            if (v) out.style = out.style ? `${out.style}; ${v}` : v;
            continue;
        }
        // .class or bare token => class
        if (part.startsWith(".")) out.class.push(part.slice(1));
        else out.class.push(part);
    }
    return {
        class: out.class.join(" ").trim(),
        style: out.style.trim(),
    };
}

export default function remarkMoveLocalAssets(opts = {}) {
    const publicBase   = opts.publicBase   ?? "auto";
    const dedupeMode   = opts.dedupeMode   ?? "global";
    const usageLogPath = opts.usageLogPath ?? path.resolve(".asset-usage.json");
    const debugLogPath = opts.debugLogPath ?? path.resolve(".debug-log.txt");
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
    fs.writeFileSync(debugLogPath, "blah\n");
    if (fs.existsSync(usageLogPath)) {
        try { usageData = JSON.parse(fs.readFileSync(usageLogPath, "utf8")); }
        catch { usageData = {}; }
    }


    return async function transformer(tree, file) {
        const filePath = file.path;
        const postId   = getPostId(filePath);
        const mdDir    = path.dirname(filePath);
        const jobs     = [];

        fs.appendFileSync(debugLogPath, "woo\n");

        visit(tree, "paragraph", (para) => {
            fs.appendFileSync(debugLogPath, "visit\n");
            const children = para.children || [];
            for (let i = 0; i < children.length; i++) {
                const node = children[i];
                if (node.type !== "image") continue;

                // 1) Gather attrs
                let className = [];
                let style = "";

                // Case A: remark-attr already populated hProperties
                const hProps = (node.data && node.data.hProperties) || {};
                if (hProps.class || hProps.className) {
                    const classes = (hProps.className ?? hProps.class ?? "").toString().trim();
                    if (classes) className.push(...classes.split(/\s+/));
                }
                if (hProps.style) style = hProps.style.toString().trim();

                // Case B: trailing "{...}" text node when remark-attr is OFF
                if (i + 1 < children.length && children[i + 1].type === "text") {
                    fs.appendFileSync(debugLogPath, "Case B\n");
                    const nextText = children[i + 1].value || "";
                    fs.appendFileSync(debugLogPath, nextText);
                    fs.appendFileSync(debugLogPath, children[i + 1]);
                    fs.appendFileSync(debugLogPath, "\n");
                    const m = nextText.match(/^\s*\{[^}]*\}\s*$/);
                    if (m) {
                        const parsed = parseAttrString(nextText); // your helper

                        fs.appendFileSync(debugLogPath, parsed);

                        if (parsed.className?.length) className.push(...parsed.className);
                        if (parsed.style) style = style ? `${style}; ${parsed.style}` : parsed.style;
                        children.splice(i + 1, 1); // remove the brace text node
                    }
                }

                // 2) Resolve/copy/rehash as you already do...
                // (keep your hashing + copy code here; omitted for brevity)

                // 3) Write back attributes in mdast-friendly way
                node.data = node.data || {};
                node.data.hProperties = {
                    ...(node.data.hProperties || {}),
                    ...(className.length ? { className } : {}),
                    ...(style ? { style } : {}),
                    // ...(width && height ? { width, height } : {}),
                };

            }
        });


        if (jobs.length) await Promise.all(jobs);
        fs.writeFileSync(usageLogPath, JSON.stringify(usageData, null, 2));
    };
}
