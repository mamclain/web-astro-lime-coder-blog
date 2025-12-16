/**
 * Normalize a slug by removing a duplicated trailing path segment.
 *
 * Some content pipelines produce slugs where the final segment is repeated,
 * for example:
 *
 *   "site_updates/2025-01-18-jekyll-blog-mostly-online/
 *    2025-01-18-jekyll-blog-mostly-online"
 *
 * This function splits the slug into path segments, removes any empty entries,
 * and drops the final segment if it is identical to the one before it.
 *
 * @param slug - A slash-delimited content slug
 * @returns An array of normalized path segments
 */
function dedupeSegments(slug: string): string[] {
    const parts = slug.split("/").filter(Boolean);
    const n = parts.length;

    if (n >= 2 && parts[n - 1] === parts[n - 2]) {
        parts.pop();
    }

    return parts;
}

/**
 * Convert a content slug into normalized URL path segments.
 *
 * This is a thin wrapper around {@link dedupeSegments} and exists to provide
 * a semantic entry point when working with routing logic.
 *
 * @param slug - A slash-delimited content slug
 * @returns An array of URL path segments
 */
export function segmentsFromSlug(slug: string): string[] {
    return dedupeSegments(slug);
}

/**
 * Convert a content slug into a canonical permalink.
 *
 * The resulting permalink:
 * - Always starts with a leading slash
 * - Always ends with a trailing slash
 * - Has duplicate trailing segments removed
 *
 * Example:
 *
 *   Input:
 *     "site_updates/2025-01-18-jekyll-blog-mostly-online/
 *      2025-01-18-jekyll-blog-mostly-online"
 *
 *   Output:
 *     "/site_updates/2025-01-18-jekyll-blog-mostly-online/"
 *
 * @param slug - A slash-delimited content slug
 * @returns A normalized permalink suitable for links and routing
 */
export function permalinkFromSlug(slug: string): string {
    return "/" + dedupeSegments(slug).join("/") + "/"; // string for links
}