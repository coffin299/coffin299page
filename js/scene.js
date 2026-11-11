// 水中レンダラの入口。描画ループは DOM の更新から分けている。

import { createCaustics } from "./scene/caustics.js?v=22";
import { createParticles } from "./scene/particles.js?v=34";
import { createPhoto, loadPlates } from "./scene/photo.js?v=41";
import { createPost } from "./scene/post.js?v=23";
import { motionAllowed, resolveTier, tierSettings } from "./scene/quality.js";
import { loadRenderer, makeTarget } from "./scene/renderer.js";
import { createVolume } from "./scene/volume.js";
import { createWaves } from "./scene/waves.js?v=21";

let running = false;
let activeTier = "";
let frameId = 0;
let disposeScene = null;
let session = 0;

function layerUrls(world) {
    if (!world.dataset.room && world.dataset.photo) {
        world.dataset.room = world.dataset.photo.replace("background.png", "background_parallax.png");
    }
    if (!world.dataset.avatar && world.dataset.photo) {
        world.dataset.avatar = world.dataset.photo.replace("background.png", "background_avator.png");
    }
}

async function boot() {
    if (running || !motionAllowed()) {
        return;
    }
    const world = document.querySelector(".world");
    const canvas = document.getElementById("world-canvas");
    if (!world || !canvas || !world.dataset.photo) {
        return;
    }
    const id = ++session;
    running = true;
    activeTier = resolveTier();
    const settings = tierSettings(activeTier);
    layerUrls(world);
    let loaded = null;
    try {
        loaded = await loadRenderer(canvas);
        if (id !== session || !motionAllowed()) {
            loaded.renderer.dispose();
            running = false;
            return;
        }
        const THREE = loaded.THREE;
        const renderer = loaded.renderer;
        const mode = loaded.mode;
        const ratio = Math.min(window.devicePixelRatio || 1, settings.pixelRatio);
        renderer.setPixelRatio(ratio);
        renderer.setClearColor(0x041422, 1);
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        const worldScene = new THREE.Scene();
        const avatarScene = new THREE.Scene();
        const frontScene = new THREE.Scene();
        worldScene.background = new THREE.Color(0x041422);
        const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
        camera.position.z = 5;
        const plates = await loadPlates(THREE, world);
        if (id !== session || !motionAllowed()) {
            renderer.dispose();
            running = false;
            return;
        }
        const waves = createWaves(THREE, mode, settings.wave);
        const photo = createPhoto(THREE, mode, plates, waves, worldScene, avatarScene);
        const caustics = createCaustics(THREE, mode, waves, worldScene);
        const volume = createVolume(THREE, mode, worldScene);
        const libraryRT = makeTarget(THREE, 2, 2);
        const particles = createParticles(THREE, mode, settings, waves, libraryRT, worldScene, frontScene);
        const post = await createPost(THREE, renderer, mode, activeTier, worldScene, camera, waves);
        if (id !== session || !motionAllowed()) {
            renderer.dispose();
            running = false;
            return;
        }
        const pointer = { x: 0, y: 0.2, sx: 0, sy: 0.2, active: false, movedAt: 0 };
        const look = { x: 0, y: 0 };
        const pointerUv = { x: 0.5, y: 0.5, lx: 0.5, ly: 0.5 };
        let aspect = 1;
        let scroll = 0;
        let time = 0;
        let accum = 0;
        let frame = 0;
        const drawing = new THREE.Vector2();

        function layout() {
            const width = window.innerWidth;
            const height = Math.max(window.innerHeight, 1);
            aspect = width / height;
            camera.left = -aspect;
            camera.right = aspect;
            camera.top = 1;
            camera.bottom = -1;
            camera.updateProjectionMatrix();
            renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, settings.pixelRatio));
            renderer.setSize(width, height, false);
            renderer.getDrawingBufferSize(drawing);
            libraryRT.setSize(Math.max(2, drawing.x), Math.max(2, drawing.y));
            if (post.setSize) {
                post.setSize(drawing.x, drawing.y);
            }
            photo.layout(aspect);
            caustics.layout(aspect);
            volume.layout(aspect);
        }

        function onPointer(event) {
            const width = window.innerWidth;
            const height = Math.max(window.innerHeight, 1);
            const nx = (event.clientX / width) * 2 - 1;
            const ny = -((event.clientY / height) * 2 - 1);
            pointer.x = nx * aspect;
            pointer.y = ny;
            pointer.active = true;
            pointer.movedAt = performance.now();
            pointerUv.x = event.clientX / width;
            pointerUv.y = 1 - event.clientY / height;
            look.x += (nx - look.x) * 0.08;
            look.y += (ny - look.y) * 0.08;
        }

        function onScroll() {
            const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
            scroll = maxScroll > 0 ? window.scrollY / maxScroll : 0;
        }

        layout();
        window.addEventListener("pointermove", onPointer, { passive: true });
        window.addEventListener("pointerdown", onPointer, { passive: true });
        window.addEventListener("resize", layout);
        window.addEventListener("scroll", onScroll, { passive: true });
        onScroll();

        function inputFor(dt, now) {
            pointer.sx += (pointer.x - pointer.sx) * Math.min(1, dt * 2.2);
            pointer.sy += (pointer.y - pointer.sy) * Math.min(1, dt * 2.2);
            const moved = Math.hypot(pointerUv.x - pointerUv.lx, pointerUv.y - pointerUv.ly);
            pointerUv.lx = pointerUv.x;
            pointerUv.ly = pointerUv.y;
            return {
                dt: dt,
                time: time,
                aspect: aspect,
                width: drawing.x,
                height: drawing.y,
                scroll: scroll,
                impulse: Math.min(0.04, moved * 2.5),
                idle: !pointer.active || now - pointer.movedAt > 1600,
                look: look,
                pointer: { x: pointer.sx, y: pointer.sy },
                pointerUv: pointerUv
            };
        }

        let last = performance.now();
        function tick(now) {
            frameId = window.requestAnimationFrame(tick);
            if (document.hidden) {
                last = now;
                return;
            }
            const dt = Math.min(0.05, (now - last) / 1000);
            last = now;
            time += dt;
            accum += dt;
            frame += 1;
            try {
                const input = inputFor(dt, now);
                if (frame % settings.stride === 0) {
                    const step = input;
                    step.dt = accum;
                    try {
                        waves.update(renderer, step);
                    } catch (error) {
                        window.__sceneError = "waves " + String(error && error.stack ? error.stack : error);
                        throw error;
                    }
                    try {
                        particles.update(renderer, accum, step);
                    } catch (error) {
                        window.__sceneError = "particles " + String(error && error.stack ? error.stack : error);
                        throw error;
                    }
                    accum = 0;
                }
                photo.syncWave();
                caustics.syncWave();
                if (post.syncWave) {
                    post.syncWave();
                }
                photo.parallax(input);
                volume.update(input);
                try {
                    particles.setSnapshot(true);
                    renderer.setRenderTarget(libraryRT);
                    renderer.setClearColor(0x041422, 1);
                    renderer.clear();
                    renderer.render(worldScene, camera);
                    renderer.setRenderTarget(null);
                    particles.setSnapshot(false);
                    renderer.autoClear = true;
                    renderer.setRenderTarget(null);
                    post.render(renderer, worldScene, camera);
                    renderer.setRenderTarget(null);
                    renderer.autoClear = false;
                    if (photo.avatar) {
                        renderer.render(avatarScene, camera);
                    }
                    renderer.render(frontScene, camera);
                    renderer.autoClear = true;
                } catch (error) {
                    window.__sceneError = "post " + String(error && error.stack ? error.stack : error);
                    throw error;
                }
                document.body.classList.add("has-scene");
                document.body.classList.add("has-photo");
            } catch (error) {
                console.warn("描画フレームに失敗したため静止画へ戻します", error);
                const tagged = String(window.__sceneError || "");
                if (!/^(waves|particles|library|post) /.test(tagged)) {
                    window.__sceneError = String(error && error.stack ? error.stack : error);
                }
                stop();
            }
        }
        frameId = window.requestAnimationFrame(tick);
        disposeScene = function () {
            window.cancelAnimationFrame(frameId);
            window.removeEventListener("pointermove", onPointer);
            window.removeEventListener("pointerdown", onPointer);
            window.removeEventListener("resize", layout);
            window.removeEventListener("scroll", onScroll);
            document.body.classList.remove("has-scene");
            document.body.classList.remove("has-photo");
            photo.dispose();
            caustics.dispose();
            volume.dispose();
            particles.dispose();
            waves.dispose();
            post.dispose();
            libraryRT.dispose();
            renderer.dispose();
            disposeScene = null;
            running = false;
        };
    } catch (error) {
        console.warn("演出の構築に失敗したため静止画を維持します", error);
        window.__sceneError = String(error && error.stack ? error.stack : error);
        if (loaded && loaded.renderer) {
            loaded.renderer.dispose();
        }
        document.body.classList.remove("has-scene");
        document.body.classList.remove("has-photo");
        running = false;
    }
}

function stop() {
    session += 1;
    if (disposeScene) {
        disposeScene();
    }
    running = false;
    activeTier = "";
}

function sync() {
    if (!motionAllowed()) {
        stop();
        return;
    }
    const tier = resolveTier();
    if (running && activeTier === tier) {
        return;
    }
    stop();
    boot();
}

function startArchiveScene() {
    sync();
    window.addEventListener("archive-quality", sync);
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", startArchiveScene);
} else {
    startArchiveScene();
}
