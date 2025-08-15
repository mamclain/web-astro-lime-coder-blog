import { For, createSignal, onMount, onCleanup } from "solid-js";
import type { Component } from "solid-js";

type Post = {
    href: string;
    title: string;
    excerpt?: string;
    date: string | Date;     // we’ll normalize to string
    image?: string | null;
    tags?: string[];
    minutes?: number;
    watermarkSrc?: string;
};

type Props = {
    items: Post[];
    initialCount?: number;
    step?: number;
    keepMax?: number; // 0 = unlimited
};

const PostGridClient: Component<Props> = (props) => {
    // normalize dates to ISO strings once
    const ALL: Post[] = (props.items ?? []).map((p) => ({
        ...p,
        date:
            p.date instanceof Date
                ? p.date.toISOString()
                : (p.date as string),
    }));

    const INITIAL = Math.max(0, props.initialCount ?? 12);
    const STEP = Math.max(1, props.step ?? 8);
    const KEEP_MAX = Math.max(0, props.keepMax ?? 60);

    let gridRef: HTMLDivElement | undefined;
    let sentinelRef: HTMLDivElement | undefined;

    const [visible, setVisible] = createSignal<Post[]>(ALL.slice(0, INITIAL));
    let cursor = INITIAL;

    // Append next chunk
    function appendChunk(n = STEP) {
        if (cursor >= ALL.length) return;
        const next = ALL.slice(cursor, Math.min(cursor + n, ALL.length));
        setVisible((prev) => {
            const merged = prev.concat(next);
            if (KEEP_MAX > 0 && merged.length > KEEP_MAX) {
                // window from the front
                return merged.slice(merged.length - KEEP_MAX);
            }
            return merged;
        });
        cursor += next.length;
    }

    // If grid content is short on tall screens, top up
    function fillIfShort(rootEl: Element | null, heightFactor = 0.9) {
        const vpH = rootEl instanceof HTMLElement
            ? rootEl.clientHeight
            : window.innerHeight;

        if (gridRef) {
            // keep adding until we roughly fill the viewport, or run out
            while (
                cursor < ALL.length &&
                gridRef.getBoundingClientRect().height < vpH * heightFactor
                ) {
                appendChunk(STEP);
            }
        }
    }

    // Find nearest scrollable parent so the scrollbar belongs to your posts column
    function getScrollParent(el: HTMLElement | undefined | null): HTMLElement | null {
        let p = el?.parentElement || null;
        while (p) {
            const oy = getComputedStyle(p).overflowY;
            if (oy === "auto" || oy === "scroll") return p;
            p = p.parentElement;
        }
        return null; // viewport
    }

    let observer: IntersectionObserver | undefined;

    onMount(() => {
        const root = getScrollParent(gridRef);
        observer = new IntersectionObserver(
            (entries) => {
                for (const e of entries) {
                    if (!e.isIntersecting) continue;
                    appendChunk(STEP);
                    fillIfShort(root);
                    if (cursor >= ALL.length && observer && sentinelRef) {
                        observer.unobserve(sentinelRef);
                    }
                }
            },
            {
                root: root ?? undefined,
                rootMargin: "0px 0px 400px 0px",
                threshold: 0,
            }
        );

        if (sentinelRef) observer.observe(sentinelRef);

        // initial top-up for very tall viewports
        fillIfShort(root);
    });

    onCleanup(() => {
        if (observer && sentinelRef) observer.unobserve(sentinelRef);
        observer?.disconnect();
    });

    return (
        <section class="relative">
            <div
                ref={gridRef!}
                class="grid gap-6
         [grid-template-columns:repeat(auto-fit,minmax(18rem,1fr))]
         lg:[grid-template-columns:repeat(auto-fit,minmax(22rem,1fr))]"
            >
                <For each={visible()}>
                    {(p, idx) => (
                        <a
                            href={p.href}
                            class="group relative block rounded-2xl border border-white/10 bg-[rgba(255,255,255,0.02)]
             shadow-[0_0_0_1px_rgba(255,255,255,0.02)_inset] hover:shadow-[0_8px_24px_rgba(0,0,0,.35)]
             transition-all duration-300 overflow-hidden card"
                        >
                            {/* watermark: visible on load */}
                            {p.watermarkSrc && (
                                <img
                                    src={p.watermarkSrc}
                                    alt=""
                                    loading={idx() < 6 ? "eager" : "lazy"}        // eager-load a few for first paint
                                    decoding="async"
                                    class="pointer-events-none select-none absolute inset-y-0 right-0 h-full w-auto
                 opacity-20 group-hover:opacity-30 transition-opacity duration-300
                 mix-blend-soft-light z-0"               // no initial translate; behind content
                                />
                            )}

                            {/* content above watermark */}
                            <div class="relative z-10 p-5 sm:p-6 md:p-7">
                                <h3 class="font-display text-2xl sm:text-3xl text-white leading-tight">
                                    {p.title}
                                </h3>

                                {(p.tags?.length || p.minutes) && (
                                    <div class="mt-3 flex flex-wrap gap-2">
                                        {p.minutes && (
                                            <span class="inline-flex items-center rounded-lg bg-[#18354b] text-[#8ed0ff]
                           text-xs px-2.5 py-1">
                {p.minutes} min read
              </span>
                                        )}
                                        <For each={p.tags ?? []}>
                                            {(t) => (
                                                <span class="inline-flex items-center rounded-lg bg-[#26361e] text-[#bdeb7f]
                             text-xs px-2.5 py-1">
                  {t}
                </span>
                                            )}
                                        </For>
                                    </div>
                                )}

                                {p.excerpt && (
                                    <p class="mt-3 text-[var(--color-ink-muted)] leading-relaxed line-clamp-3">
                                        {p.excerpt}
                                    </p>
                                )}

                                <div class="mt-4 text-sm text-[var(--color-ink-muted)]">
                                    {p.date ? new Date(p.date).toLocaleDateString() : ""}
                                </div>
                            </div>
                        </a>
                    )}
                </For>
            </div>

            {/* spacer so last card doesn't clip under bottom edge */}
            <div class="h-16 sm:h-20"></div>

            {/* sentinel watched by IntersectionObserver */}
            <div ref={sentinelRef!} class="h-1"></div>
        </section>
    );
};

export default PostGridClient;