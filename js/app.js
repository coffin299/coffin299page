// ナビ、品質切替、入場アニメーション、静止画時の視差。

function readQuality() {
    // 動きを減らす設定では演出を止める
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
        return "still";
    }
    const saved = localStorage.getItem("scene-quality");
    if (saved === "still") {
        return "still";
    }
    return "auto";
}

function applyQuality(quality, persist) {
    // ルート属性をシーン側が読む
    document.documentElement.dataset.quality = quality;
    if (persist) {
        localStorage.setItem("scene-quality", quality);
    }
    const button = document.getElementById("quality-toggle");
    if (button) {
        const still = quality === "still";
        button.textContent = still ? "Still" : "Auto";
        button.setAttribute("aria-pressed", still ? "true" : "false");
    }
    window.dispatchEvent(new CustomEvent("archive-quality", { detail: quality }));
}

class QualityControl {
    constructor() {
        this.quality = readQuality();
        applyQuality(this.quality, false);
        const button = document.getElementById("quality-toggle");
        if (!button) {
            return;
        }
        button.addEventListener("click", () => {
            // 静止と自動を交互に切り替える
            const next = this.quality === "still" ? "auto" : "still";
            const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
            if (reduced) {
                this.quality = "still";
                applyQuality("still", true);
                return;
            }
            this.quality = next;
            applyQuality(next, true);
        });
    }
}

class NavigationManager {
    constructor() {
        this.links = Array.from(document.querySelectorAll(".nav-link"));
        this.sections = Array.from(document.querySelectorAll("main section[id]"));
        this.bindClicks();
        this.syncFromLocation();
        this.watchSections();
    }

    bindClicks() {
        this.links.forEach((link) => {
            link.addEventListener("click", () => {
                const href = link.getAttribute("href") || "";
                // ページ内アンカーだけ、クリック直後に現在位置を合わせる
                if (href.startsWith("#")) {
                    this.setActive(href.slice(1));
                }
            });
        });
    }

    setActive(id) {
        this.links.forEach((link) => {
            const href = link.getAttribute("href") || "";
            const match = href === "#" + id || (id === "home" && (href === "./" || href === "../../" || href === "#home"));
            link.classList.toggle("active", match);
        });
    }

    syncFromLocation() {
        const path = window.location.pathname.replace(/\/index\.html?$/, "/");
        let section = "home";
        if (path.includes("/pages/about")) {
            section = "about";
        } else if (path.includes("/pages/portfolios")) {
            section = "portfolios";
        } else if (path.includes("/pages/contact")) {
            section = "contact";
        }
        this.links.forEach((link) => {
            const href = link.getAttribute("href") || "";
            const match =
                (section === "about" && href.includes("about")) ||
                (section === "portfolios" && href.includes("portfolios")) ||
                (section === "contact" && href.includes("contact")) ||
                (section === "home" && href.includes("#home"));
            link.classList.toggle("active", match);
        });
    }

    watchSections() {
        // 単一ページのときだけ、見えている節でナビを更新する
        if (this.sections.length < 2) {
            return;
        }
        const observer = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    if (entry.isIntersecting) {
                        this.setActive(entry.target.id);
                    }
                });
            },
            { rootMargin: "-45% 0px -45% 0px", threshold: 0.01 }
        );
        this.sections.forEach((section) => observer.observe(section));
    }
}

class AnimationManager {
    constructor() {
        this.observer = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    if (!entry.isIntersecting) {
                        return;
                    }
                    entry.target.classList.add("is-visible");
                    this.observer.unobserve(entry.target);
                });
            },
            { threshold: 0.12, rootMargin: "0px 0px -40px 0px" }
        );
    }

    observe() {
        document.querySelectorAll("[data-reveal]").forEach((element) => {
            this.observer.observe(element);
        });
    }
}

class VisitorCounterManager {
    constructor() {
        this.counter = document.querySelector(".visitor-counter");
        this.visible = false;
        if (!this.counter) {
            return;
        }
        this.onScroll = () => {
            const threshold = Math.max(window.innerHeight * 0.35, 120);
            const show = window.scrollY > threshold;
            if (show === this.visible) {
                return;
            }
            this.visible = show;
            this.counter.classList.toggle("visible", show);
        };
        window.addEventListener("scroll", this.onScroll, { passive: true });
        this.onScroll();
    }
}

class Atmosphere {
    constructor() {
        this.surface = document.getElementById("world-surface");
        this.pointerX = 0;
        this.pointerY = 0;
        window.addEventListener("pointermove", (event) => {
            const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
            if (reduced) {
                return;
            }
            // 静止画のとき、背景位置をわずかにずらす
            this.pointerX = event.clientX / window.innerWidth - 0.5;
            this.pointerY = event.clientY / window.innerHeight - 0.5;
            document.documentElement.style.setProperty("--px", this.pointerX.toFixed(3));
            document.documentElement.style.setProperty("--py", this.pointerY.toFixed(3));
        }, { passive: true });
        window.addEventListener("scroll", () => this.updateScroll(), { passive: true });
        this.updateScroll();
    }

    updateScroll() {
        const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
        const progress = maxScroll > 0 ? window.scrollY / maxScroll : 0;
        const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        if (!reduced) {
            document.documentElement.style.setProperty("--scroll", progress.toFixed(3));
        }
        if (!this.surface) {
            return;
        }
        const page = document.body.dataset.page || "home";
        const floor = page === "contact" ? 0.42 : 0;
        const ramp = Math.max(0, (progress - 0.58) / 0.42);
        this.surface.style.opacity = String(floor + (1 - floor) * ramp);
    }
}

function initApp() {
    document.documentElement.dataset.quality = readQuality();
    new QualityControl();
    new NavigationManager();
    const motion = new AnimationManager();
    new VisitorCounterManager();
    new Atmosphere();
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", () => motion.observe());
    } else {
        motion.observe();
    }
}

initApp();
