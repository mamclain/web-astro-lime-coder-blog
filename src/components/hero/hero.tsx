import { createSignal, onMount } from "solid-js";


type HeroProps = {
    videoSrc: string;
    sectionClass: string;
    videoClass?: string;
};
export default function HeroScript({
                                       videoSrc,
                                       sectionClass,
                                       videoClass,
                                   }: HeroProps)
{
    const [sectionRef, setSectionRef] = createSignal<HTMLElement | null>(null);
    const videoClassDefault =
        "absolute inset-0 w-full h-full object-cover hero-media";

    onMount(() => {
        const section = sectionRef();
        if (!section) return;

        const video = document.createElement("video");
        video.src = videoSrc;
        video.muted = true;
        video.playsInline = true;
        video.preload = "auto";
        video.className = videoClass || videoClassDefault;

        section.innerHTML = "";
        section.appendChild(video);

        const getRandomDelay = () =>
            Math.floor(Math.random() * (30000 - 5000 + 1)) + 5000;

        function playWithDelay() {
            video.currentTime = 0;
            video.play().catch(console.error);
            video.onended = () => setTimeout(playWithDelay, getRandomDelay());
        }

        video.addEventListener("canplay", playWithDelay, { once: true });
    });

    return <section ref={setSectionRef} class={sectionClass} />;
}