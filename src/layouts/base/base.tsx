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

async function fetchAndSwapInner(url: string) {
    const target = document.querySelector(TARGET_SELECTOR) as HTMLElement | null;
    if (!target) { await fetchAndSwapDocument(url); return; }

    // animate OUT
    target.classList.remove("fade-grow-in");
    target.classList.add("fade-shrink-out");
    await new Promise((r) => setTimeout(r, OUT_MS));

    showOverlay();

    const res = await fetch(url, { credentials: "same-origin" });
    const html = await res.text();
    const doc = new DOMParser().parseFromString(html, "text/html");
    const fresh = doc.querySelector(TARGET_SELECTOR) as HTMLElement | null;

    // collapse again before swap
    target.classList.remove("fade-shrink-out");
    target.classList.add("fade-grow-in");
    target.innerHTML = "";

    await new Promise((r) => setTimeout(r, OUT_MS));
    target.classList.remove("fade-grow-in");
    target.classList.add("fade-shrink-out");
    await new Promise((r) => setTimeout(r, OUT_MS));

    if (fresh) {
        target.innerHTML = fresh.innerHTML;
    } else {
        await fetchAndSwapDocument(url);
        hideOverlay();
        return;
    }

    // animate IN
    target.classList.remove("fade-shrink-out");
    target.classList.add("fade-grow-in");

    // push state
    window.history.pushState({}, "", url);

    hideOverlay();
}

const BaseClient = () => {
    onMount(() => {

        const hasVT =
            "startViewTransition" in document &&
            (window as any).navigation &&
            typeof (document as any).startViewTransition === "function";

        if (hasVT) {
            const handler = (event: any) => {
                const to = new URL(event.destination.url);
                if (to.origin !== location.origin) return;
                if (event.canIntercept === false) return;
                if (to.pathname === location.pathname && to.hash) return;

                event.intercept({
                    async handler() {
                        showOverlay();
                        try {
                            // Use the inner swap so the overlay stays in the current DOM.
                            // (Optional) If you want VT blur/scale on top, you can wrap this call
                            // with startViewTransition, but DO NOT replace the entire document.
                            await fetchAndSwapInner(to.href);
                        } finally {
                            hideOverlay();
                        }
                    },
                });
            };

            (window as any).navigation.addEventListener("navigate", handler);
            onCleanup(() => (window as any).navigation.removeEventListener("navigate", handler));
            return;
        }

        // Fallback: delegated links + popstate
        const target = document.querySelector(TARGET_SELECTOR) as HTMLElement | null;
        if (target && !target.classList.contains("fade-grow-in")) target.classList.add("fade-grow-in");

        const navClickHandler = async (e: MouseEvent) => {
            const a = (e.target as HTMLElement)?.closest("a") as HTMLAnchorElement | null;
            if (!isSafeLink(a)) return;
            if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
            e.preventDefault();
            await fetchAndSwapInner(a!.href);
        };

        const delegatedClickHandler = async (e: MouseEvent) => {
            const a = (e.target as HTMLElement)?.closest("a") as HTMLAnchorElement | null;
            if (!a || !target || !target.contains(a)) return;
            if (!isSafeLink(a)) return;
            if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
            e.preventDefault();
            await fetchAndSwapInner(a.href);
        };

        const popHandler = async () => {
            await fetchAndSwapInner(location.href);
        };

        document.addEventListener("click", navClickHandler);
        if (target) target.addEventListener("click", delegatedClickHandler);
        window.addEventListener("popstate", popHandler);

        onCleanup(() => {
            document.removeEventListener("click", navClickHandler);
            if (target) target.removeEventListener("click", delegatedClickHandler);
            window.removeEventListener("popstate", popHandler);
        });
    });

    return null;
};

export default BaseClient;