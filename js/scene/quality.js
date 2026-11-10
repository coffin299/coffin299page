// 描画品質。Auto は画面幅で High / Low を決め、Still はキャンバスを出さない。

export function isMobile() {
    return window.matchMedia("(max-width: 800px)").matches;
}

export function motionAllowed() {
    // OS が動きの抑制を求めているときは止める
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const quality = document.documentElement.dataset.quality || "auto";
    return !reduced && quality !== "still";
}

export function resolveTier() {
    const quality = document.documentElement.dataset.quality || "auto";
    // 明示的な Low と狭い画面は粒子と解像度を落とす
    if (quality === "low" || isMobile()) {
        return "low";
    }
    return "high";
}

export function tierSettings(tier) {
    if (tier === "low") {
        return {
            fish: 8,
            bubble: 48,
            dust: 36,
            plankton: 24,
            wave: 128,
            stride: 3,
            pixelRatio: 1,
            post: "simple"
        };
    }
    return {
        fish: 24,
        bubble: 160,
        dust: 120,
        plankton: 80,
        wave: 256,
        stride: 1,
        pixelRatio: 1.5,
        post: "full"
    };
}
