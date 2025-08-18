/** @jsxImportSource solid-js */
import { onMount, onCleanup } from "solid-js";

const TARGET_SELECTOR = "#transition-target";
const OUT_MS = 600;


function restartRevealAnimation() {
    const overlay = document.getElementById("nav-loader");
    if (!overlay) return;
    // re-run animation each time: drop class → reflow → add class
    overlay.classList.remove("animating");
    void overlay.offsetWidth; // force reflow
    overlay.classList.add("animating");
}

function showOverlay() {
    document.documentElement.classList.add("loader-show");
    restartRevealAnimation();
}

function hideOverlay() {
    const overlay = document.getElementById("nav-loader");
    if (overlay) {
        // ensure final state is fully revealed before hiding overlay
        const colorImg = overlay.querySelector<HTMLImageElement>(".loader-image img.color");
        if (colorImg) colorImg.style.clipPath = "inset(0 0 0 0)";
        overlay.classList.remove("animating");
    }
    document.documentElement.classList.remove("loader-show");
}

function isSafeLink(a: HTMLAnchorElement | null) {
    if (!a) return false;
    if (a.target && a.target !== "_self") return false;
    const url = new URL(a.href, location.href);
    if (url.origin !== location.origin) return false;
    if (url.pathname === location.pathname && url.hash) return false;
    return true;
}


async function fetchAndSwapDocument(url: string) {
    const res = await fetch(url, { credentials: "same-origin" });
    const html = await res.text();
    const doc = new DOMParser().parseFromString(html, "text/html");
    document.documentElement.replaceWith(doc.documentElement);
}

async function fetchAndSwapInner(url: string, opts: { push?: boolean } = {}) {
    const { push = true } = opts;
    const target = document.querySelector(TARGET_SELECTOR) as HTMLElement | null;
    if (!target) { await fetchAndSwapDocument(url); return; }

    // animate OUT
    // target.classList.remove("fade-grow-in");
    // target.classList.add("fade-shrink-out");
    // await new Promise((r) => setTimeout(r, OUT_MS));

    target.innerHTML = "";
    showOverlay();
    await new Promise((r) => setTimeout(r, OUT_MS));

    const res = await fetch(url, { credentials: "same-origin" });
    const html = await res.text();
    const doc = new DOMParser().parseFromString(html, "text/html");
    const fresh = doc.querySelector(TARGET_SELECTOR) as HTMLElement | null;

    // collapse again before swap
    // target.classList.remove("fade-shrink-out");
    // target.classList.add("fade-grow-in");
    // target.innerHTML = "";

    // await new Promise((r) => setTimeout(r, OUT_MS));
    // target.classList.remove("fade-grow-in");
    // target.classList.add("fade-shrink-out");
    // await new Promise((r) => setTimeout(r, OUT_MS));

    if (fresh) {
        target.innerHTML = fresh.innerHTML;
        hideOverlay();
    } else {
        await fetchAndSwapDocument(url);
        hideOverlay();
        return;
    }

    // animate IN
    // target.classList.remove("fade-shrink-out");
    // target.classList.add("fade-grow-in");

    // only push when we're NOT inside an intercepted nav
    if (push) {
        window.history.pushState({}, "", url);
    }

    hideOverlay();
}


const BaseClient = () => {
    onMount(() => {
        // Chrome path (Navigation API + View Transitions)
        const supportsNavAPI =
            typeof (window as any).navigation?.addEventListener === "function";
        const supportsVTA =
            typeof (document as any).startViewTransition === "function";
        const useVTPath = supportsNavAPI && supportsVTA;

        if (useVTPath) {
            const handler = (event: any) => {
                const to = new URL(event.destination.url);
                if (to.origin !== location.origin) return;
                if (event.canIntercept === false) return;
                if (to.pathname === location.pathname && to.hash) return;

                event.intercept({
                    async handler() {
                        showOverlay();
                        try {
                            // inner swap only; let the navigation commit the URL
                            await fetchAndSwapInner(to.href, { push: false });

                            // Safety for cases where URL wasn't committed:
                            if (location.href !== to.href) {
                                history.replaceState(history.state, "", to.href);
                            }
                        } finally {
                            hideOverlay();
                        }
                    },
                });
            };

            (window as any).navigation.addEventListener("navigate", handler);
            onCleanup(() =>
                (window as any).navigation.removeEventListener("navigate", handler)
            );

            // Also handle back/forward explicitly (some platforms still emit this)
            const popHandler = async () => {
                showOverlay();
                try {
                    await fetchAndSwapInner(location.href, { push: false });
                } finally {
                    hideOverlay();
                }
            };
            window.addEventListener("popstate", popHandler);
            onCleanup(() => window.removeEventListener("popstate", popHandler));

            return; // don’t install the fallback if we’re using VT path
        }

        // ---------- Firefox / Safari fallback (no Navigation API) ----------
        const target = document.querySelector(TARGET_SELECTOR) as HTMLElement | null;
        if (target && !target.classList.contains("fade-grow-in")) {
            target.classList.add("fade-grow-in");
        }

        // Intercept normal clicks
        const clickHandler = async (e: MouseEvent) => {
            const a = (e.target as HTMLElement)?.closest("a") as HTMLAnchorElement | null;
            if (!isSafeLink(a)) return;

            // modifier keys (new tab etc.) -> let browser handle
            if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;

            e.preventDefault();
            showOverlay();
            try {
                await fetchAndSwapInner(a!.href, { push: true }); // we must push in fallback
            } finally {
                hideOverlay();
            }
        };

        // Handle back/forward
        const popHandler = async () => {
            showOverlay();
            try {
                await fetchAndSwapInner(location.href, { push: false });
            } finally {
                hideOverlay();
            }
        };

        document.addEventListener("click", clickHandler);
        window.addEventListener("popstate", popHandler);
        onCleanup(() => {
            document.removeEventListener("click", clickHandler);
            window.removeEventListener("popstate", popHandler);
        });
    });

    return null;
};

export default BaseClient;