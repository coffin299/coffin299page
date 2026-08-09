// テーマ管理: システム準拠 + 手動トグル
class ThemeManager {
    constructor() {
        // 現在テーマを初期判定から取得
        this.currentTheme = this.getInitialTheme();
        this.themeToggle = null;
        this.themeIcon = null;
        this.init();
    }

    getSystemTheme() {
        // OS の prefers-color-scheme を参照
        if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
            return 'dark';
        }
        return 'light';
    }

    getInitialTheme() {
        // 手動選択があれば優先、なければシステム準拠
        const savedTheme = localStorage.getItem('theme');
        if (savedTheme === 'dark' || savedTheme === 'light') {
            return savedTheme;
        }
        return this.getSystemTheme();
    }

    init() {
        this.themeToggle = document.getElementById('theme-toggle');
        this.themeIcon = document.getElementById('theme-icon');
        this.setTheme(this.currentTheme, false);
        this.setupEventListeners();
        this.setupSystemThemeListener();
        this.setupStorageListener();
    }

    setupSystemThemeListener() {
        // 手動未選択時のみ OS 変更に追従
        if (!window.matchMedia) {
            return;
        }
        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
            if (!localStorage.getItem('theme')) {
                this.setTheme(e.matches ? 'dark' : 'light', false);
            }
        });
    }

    setupEventListeners() {
        if (!this.themeToggle) {
            return;
        }
        this.themeToggle.addEventListener('click', () => {
            this.toggleTheme();
        });
    }

    setTheme(theme, persist) {
        // data-theme を適用
        document.documentElement.setAttribute('data-theme', theme);
        this.currentTheme = theme;

        // 明示トグル時のみ localStorage に保存
        if (persist) {
            localStorage.setItem('theme', theme);
        }

        // アイコン更新（ダーク時は太陽、ライト時は月）
        if (this.themeIcon) {
            this.themeIcon.className = theme === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
        }

        this.notifyThemeChange();
    }

    toggleTheme() {
        const newTheme = this.currentTheme === 'light' ? 'dark' : 'light';
        this.setTheme(newTheme, true);
    }

    notifyThemeChange() {
        // 他タブへ変更を通知
        if (typeof Storage !== 'undefined') {
            localStorage.setItem('theme-changed', Date.now().toString());
        }
    }

    setupStorageListener() {
        window.addEventListener('storage', (e) => {
            if (e.key === 'theme' || e.key === 'theme-changed') {
                const savedTheme = localStorage.getItem('theme');
                if (savedTheme && savedTheme !== this.currentTheme) {
                    this.setTheme(savedTheme, false);
                } else if (!savedTheme) {
                    this.setTheme(this.getSystemTheme(), false);
                }
            }
        });
    }

    getCurrentTheme() {
        return this.currentTheme;
    }
}

// ナビのアクティブ状態管理
class NavigationManager {
    constructor() {
        this.navLinks = document.querySelectorAll('.nav-link');
        this.setupEventListeners();
        this.setActiveLinkByCurrentPage();
    }

    setupEventListeners() {
        this.navLinks.forEach((link) => {
            link.addEventListener('click', (e) => {
                this.setActiveLink(e.currentTarget);
            });
        });
    }

    setActiveLink(clickedLink) {
        this.navLinks.forEach((link) => {
            link.classList.remove('active');
        });
        clickedLink.classList.add('active');
    }

    setActiveLinkByCurrentPage() {
        // クリーンURL（/pages/about/）対応でパスからセクション判定
        const path = window.location.pathname.replace(/\/index\.html?$/, '/');
        let section = 'home';
        if (path.includes('/pages/about')) {
            section = 'about';
        } else if (path.includes('/pages/portfolios')) {
            section = 'portfolios';
        } else if (path.includes('/pages/contact')) {
            section = 'contact';
        }

        this.navLinks.forEach((link) => {
            link.classList.remove('active');
            const href = link.getAttribute('href') || '';
            const matches =
                (section === 'about' && href.includes('about')) ||
                (section === 'portfolios' && href.includes('portfolios')) ||
                (section === 'contact' && href.includes('contact')) ||
                (section === 'home' && !href.includes('about') && !href.includes('portfolios') && !href.includes('contact'));
            if (matches) {
                link.classList.add('active');
            }
        });
    }
}

// スクロール入場アニメーション
class AnimationManager {
    constructor() {
        this.observer = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    if (entry.isIntersecting) {
                        entry.target.classList.add('is-visible');
                        this.observer.unobserve(entry.target);
                    }
                });
            },
            {
                threshold: 0.12,
                rootMargin: '0px 0px -40px 0px'
            }
        );
    }

    observeElements() {
        document.querySelectorAll('[data-reveal]').forEach((element) => {
            this.observer.observe(element);
        });
    }
}

// 訪問カウンター表示（Home のみ）
class VisitorCounterManager {
    constructor() {
        this.counter = document.querySelector('.visitor-counter');
        this.isVisible = false;
        this.init();
    }

    init() {
        if (!this.counter) {
            return;
        }
        this.setupScrollListener();
    }

    setupScrollListener() {
        const onScroll = () => {
            const threshold = Math.max(window.innerHeight * 0.35, 120);
            if (window.scrollY > threshold && !this.isVisible) {
                this.showCounter();
            } else if (window.scrollY <= threshold && this.isVisible) {
                this.hideCounter();
            }
        };
        window.addEventListener('scroll', onScroll, { passive: true });
        onScroll();
    }

    showCounter() {
        this.counter.classList.add('visible');
        this.isVisible = true;
    }

    hideCounter() {
        this.counter.classList.remove('visible');
        this.isVisible = false;
    }
}

// アプリ初期化
class PortfolioApp {
    constructor() {
        this.themeManager = new ThemeManager();
        this.navigationManager = new NavigationManager();
        this.animationManager = new AnimationManager();
        this.visitorCounterManager = new VisitorCounterManager();
        this.init();
    }

    init() {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => {
                this.animationManager.observeElements();
            });
        } else {
            this.animationManager.observeElements();
        }
        this.setupSmoothScrolling();
        this.setupKeyboardNavigation();
    }

    setupSmoothScrolling() {
        document.querySelectorAll('a[href^="#"]').forEach((link) => {
            link.addEventListener('click', (e) => {
                const targetId = link.getAttribute('href')?.substring(1);
                const targetElement = document.getElementById(targetId || '');
                if (!targetElement) {
                    return;
                }
                e.preventDefault();
                targetElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
            });
        });
    }

    setupKeyboardNavigation() {
        document.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 't') {
                e.preventDefault();
                this.themeManager.toggleTheme();
            }
        });
    }
}

let app;

function initializeApp() {
    if (app) {
        return;
    }
    app = new PortfolioApp();
}

function initApp() {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initializeApp);
    } else {
        initializeApp();
    }
    setTimeout(() => {
        if (!app) {
            initializeApp();
        }
    }, 1000);
}

initApp();
