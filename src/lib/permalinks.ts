function dedupeSegments(slug: string): string[] {
    const parts = slug.split("/").filter(Boolean);
    const n = parts.length;
    if (n >= 2 && parts[n - 1] === parts[n - 2]) parts.pop();
    return parts; // e.g. ["site_updates","2025-01-18-jekyll-blog-mostly-online"]
}

export function segmentsFromSlug(slug: string): string[] {
    return dedupeSegments(slug);
}

export function permalinkFromSlug(slug: string): string {
    return "/" + dedupeSegments(slug).join("/") + "/"; // string for links
}