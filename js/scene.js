// 水中の光芒、泡、カーソルへ泳ぐ魚。描けない環境では静止画のままにする。

const THREE_CDN = "https://cdn.jsdelivr.net/npm/three@0.180.0/build/";
const IMAGE_POINT = { x: 0.66, y: 0.4 };

let running = false;
let frameId = 0;
let disposeScene = null;

function motionAllowed() {
    // OS が動きの抑制を求めている
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    // ページ側の品質指定
    const quality = document.documentElement.dataset.quality || "auto";
    return !reduced && quality !== "still";
}

function fishCount() {
    // 狭い画面は匹数を減らす
    if (window.matchMedia("(max-width: 800px)").matches) {
        return 5;
    }
    return 12;
}

function bubbleCount() {
    // 狭い画面は泡も減らす
    if (window.matchMedia("(max-width: 800px)").matches) {
        return 36;
    }
    return 84;
}

function makeFishCanvas(fill) {
    // 平たい魚のテクスチャ。精細なモデルは使わない
    const canvas = document.createElement("canvas");
    canvas.width = 160;
    canvas.height = 80;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.ellipse(92, 40, 42, 16, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(54, 40);
    ctx.lineTo(16, 16);
    ctx.lineTo(28, 40);
    ctx.lineTo(16, 64);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(96, 30);
    ctx.lineTo(74, 10);
    ctx.lineTo(108, 30);
    ctx.fill();
    ctx.fillStyle = "#083044";
    ctx.beginPath();
    ctx.arc(116, 36, 4, 0, Math.PI * 2);
    ctx.fill();
    return canvas;
}

function makeBubbleCanvas() {
    // 縁が溶ける円。点描の泡に貼る
    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext("2d");
    const glow = ctx.createRadialGradient(32, 32, 4, 32, 32, 30);
    glow.addColorStop(0, "rgba(255,255,255,0.85)");
    glow.addColorStop(0.45, "rgba(190,235,255,0.28)");
    glow.addColorStop(1, "rgba(190,235,255,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, 64, 64);
    return canvas;
}

function coverRepeat(viewAspect, imageAspect) {
    // 画面を埋めるように、はみ出す軸だけを切り取る
    if (viewAspect > imageAspect) {
        return { x: 1, y: imageAspect / viewAspect };
    }
    return { x: viewAspect / imageAspect, y: 1 };
}

function screenPoint() {
    // 縦長では人物を下寄り中央、横長では右下に置く
    if (window.matchMedia("(max-width: 800px)").matches) {
        return { x: 0.56, y: 0.24 };
    }
    return { x: 0.76, y: 0.36 };
}

async function loadRenderer(canvas) {
    // WebGPU が使えるときだけ先に試す
    if (navigator.gpu) {
        try {
            const THREE = await import(THREE_CDN + "three.webgpu.js");
            const renderer = new THREE.WebGPURenderer({ canvas: canvas, antialias: false, alpha: true });
            await renderer.init();
            return { THREE: THREE, renderer: renderer, mode: "webgpu" };
        } catch (error) {
            console.warn("WebGPU を使えなかったため WebGL に切り替えます", error);
        }
    }
    // WebGL の通常レンダラ
    const THREE = await import(THREE_CDN + "three.module.js");
    const renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: false, alpha: true });
    return { THREE: THREE, renderer: renderer, mode: "webgl" };
}

function buildPhotoMaterial(THREE, mode, texture, uniforms) {
    // WebGPU はノードで屈折を足す。値は毎フレーム同じ uniform を更新する
    if (mode === "webgpu") {
        const tsl = THREE.TSL;
        const material = new THREE.MeshBasicNodeMaterial();
        const uvNode = tsl.uv();
        const drift = tsl.vec2(
            tsl.sin(uvNode.y.mul(16).add(tsl.time.mul(0.6))),
            tsl.cos(uvNode.x.mul(14).sub(tsl.time.mul(0.5)))
        ).mul(0.0035);
        const repeat = tsl.uniform(uniforms.uRepeat.value);
        const focus = tsl.uniform(uniforms.uFocus.value);
        const parallax = tsl.uniform(uniforms.uParallax.value);
        uniforms.gpuRepeat = repeat;
        uniforms.gpuFocus = focus;
        uniforms.gpuParallax = parallax;
        const sampleUv = uvNode.sub(0.5).mul(repeat).add(focus).add(parallax).add(drift);
        material.colorNode = tsl.texture(texture, sampleUv);
        material.depthWrite = false;
        return material;
    }
    // WebGL は同じ見た目のシェーダ
    return new THREE.ShaderMaterial({
        uniforms: uniforms,
        depthWrite: false,
        vertexShader: [
            "varying vec2 vUv;",
            "void main() {",
            "  vUv = uv;",
            "  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);",
            "}"
        ].join("\n"),
        fragmentShader: [
            "precision highp float;",
            "uniform sampler2D uMap;",
            "uniform float uTime;",
            "uniform vec2 uRepeat;",
            "uniform vec2 uFocus;",
            "uniform vec2 uParallax;",
            "varying vec2 vUv;",
            "void main() {",
            "  vec2 uv = (vUv - 0.5) * uRepeat + uFocus + uParallax;",
            "  uv += vec2(sin(uv.y * 16.0 + uTime * 0.6), cos(uv.x * 14.0 - uTime * 0.5)) * 0.0035;",
            "  uv = clamp(uv, 0.001, 0.999);",
            "  gl_FragColor = texture2D(uMap, uv);",
            "}"
        ].join("\n")
    });
}

function buildGodRayMaterial(THREE, mode, uniforms) {
    // 水面の一点から、下に広がる細い光の筋
    if (mode === "webgpu") {
        const tsl = THREE.TSL;
        const uvNode = tsl.uv();
        const down = tsl.float(1).sub(uvNode.y);
        const spread = uvNode.x.sub(0.5).div(down.mul(0.85).add(0.2));
        const sway = tsl.time.mul(0.12);
        const centers = [
            sway.sin().mul(0.12),
            sway.mul(0.8).cos().mul(0.16).add(0.34),
            sway.mul(0.7).sin().mul(0.14).sub(0.36),
            sway.mul(1.1).cos().mul(0.1).add(0.12)
        ];
        const widths = [0.18, 0.11, 0.15, 0.09];
        let ray = tsl.float(0);
        for (let index = 0; index < centers.length; index += 1) {
            const gap = spread.sub(centers[index]).abs();
            const band = tsl.float(1).sub(tsl.smoothstep(tsl.float(0), tsl.float(widths[index]), gap));
            ray = ray.add(band);
        }
        const fade = tsl.smoothstep(tsl.float(1.05), tsl.float(0.02), down);
        const alpha = ray.mul(fade).mul(0.22);
        const material = new THREE.MeshBasicNodeMaterial();
        material.colorNode = tsl.vec3(0.78, 0.93, 1.0);
        material.opacityNode = alpha;
        material.transparent = true;
        material.depthWrite = false;
        material.blending = THREE.AdditiveBlending;
        return material;
    }
    return new THREE.ShaderMaterial({
        uniforms: { uTime: uniforms.uTime },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        vertexShader: [
            "varying vec2 vUv;",
            "void main() {",
            "  vUv = uv;",
            "  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);",
            "}"
        ].join("\n"),
        fragmentShader: [
            "precision highp float;",
            "uniform float uTime;",
            "varying vec2 vUv;",
            "void main() {",
            "  float down = 1.0 - vUv.y;",
            "  float spread = (vUv.x - 0.5) / (down * 0.85 + 0.2);",
            "  float sway = uTime * 0.12;",
            "  float ray = 0.0;",
            "  ray += 1.0 - smoothstep(0.0, 0.18, abs(spread - sin(sway) * 0.12));",
            "  ray += 1.0 - smoothstep(0.0, 0.11, abs(spread - (cos(sway * 0.8) * 0.16 + 0.34)));",
            "  ray += 1.0 - smoothstep(0.0, 0.15, abs(spread - (sin(sway * 0.7) * 0.14 - 0.36)));",
            "  ray += 1.0 - smoothstep(0.0, 0.09, abs(spread - (cos(sway * 1.1) * 0.10 + 0.12)));",
            "  float fade = smoothstep(1.05, 0.02, down);",
            "  float alpha = clamp(ray, 0.0, 1.5) * fade * 0.22;",
            "  gl_FragColor = vec4(0.78, 0.93, 1.0, alpha);",
            "}"
        ].join("\n")
    });
}

function buildCausticMaterial(THREE, mode, uniforms) {
    // 加算で薄く光を乗せる
    if (mode === "webgpu") {
        const tsl = THREE.TSL;
        const material = new THREE.MeshBasicNodeMaterial();
        const uvNode = tsl.uv();
        const t = tsl.time.mul(0.35);
        const wave = tsl.sin(uvNode.x.mul(18).add(t)).mul(tsl.sin(uvNode.y.mul(14).sub(t.mul(0.8))));
        const wave2 = tsl.sin(uvNode.x.mul(9).add(uvNode.y.mul(11)).add(t.mul(1.3)));
        const caustic = wave.mul(wave2).mul(0.5).add(0.5);
        material.colorNode = tsl.vec3(0.55, 0.9, 1.0).mul(caustic);
        material.opacityNode = caustic.mul(0.16);
        material.transparent = true;
        material.depthWrite = false;
        material.blending = THREE.AdditiveBlending;
        return material;
    }
    return new THREE.ShaderMaterial({
        uniforms: { uTime: uniforms.uTime },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        vertexShader: [
            "varying vec2 vUv;",
            "void main() {",
            "  vUv = uv;",
            "  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);",
            "}"
        ].join("\n"),
        fragmentShader: [
            "precision highp float;",
            "uniform float uTime;",
            "varying vec2 vUv;",
            "void main() {",
            "  float t = uTime * 0.35;",
            "  float wave = sin(vUv.x * 18.0 + t) * sin(vUv.y * 14.0 - t * 0.8);",
            "  float wave2 = sin(vUv.x * 9.0 + vUv.y * 11.0 + t * 1.3);",
            "  float caustic = clamp(wave * wave2 * 0.5 + 0.5, 0.0, 1.0);",
            "  gl_FragColor = vec4(0.55, 0.9, 1.0, caustic * 0.16);",
            "}"
        ].join("\n")
    });
}

async function boot() {
    // すでに動いている、または静止指定なら何もしない
    if (running || !motionAllowed()) {
        return;
    }
    const world = document.querySelector(".world");
    const canvas = document.getElementById("world-canvas");
    // 背景要素が無いページでは演出しない
    if (!world || !canvas || !world.dataset.photo) {
        return;
    }
    running = true;
    let loaded = null;
    try {
        loaded = await loadRenderer(canvas);
    } catch (error) {
        running = false;
        console.warn("描画コンテキストを初期化できません", error);
        return;
    }
    // 起動中に静止へ切り替わっていたら破棄する
    if (!motionAllowed()) {
        loaded.renderer.dispose();
        running = false;
        return;
    }
    try {
    const THREE = loaded.THREE;
    const renderer = loaded.renderer;
    const mode = loaded.mode;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, window.innerWidth < 800 ? 1.25 : 1.6));
    renderer.setClearColor(0x000000, 0);

    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
    camera.position.z = 5;

    const photoUniforms = {
        uMap: { value: null },
        uTime: { value: 0 },
        uRepeat: { value: new THREE.Vector2(1, 1) },
        uFocus: { value: new THREE.Vector2(0.5, 0.5) },
        uParallax: { value: new THREE.Vector2() }
    };
    const loader = new THREE.TextureLoader();
    let texture = null;
    try {
        texture = await loader.loadAsync(world.dataset.photo);
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.minFilter = THREE.LinearFilter;
        texture.magFilter = THREE.LinearFilter;
        photoUniforms.uMap.value = texture;
    } catch (error) {
        console.warn("背景テクスチャを読めなかったため、静止画の上に演出だけ重ねます", error);
    }

    const photo = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), texture ? buildPhotoMaterial(THREE, mode, texture, photoUniforms) : new THREE.MeshBasicMaterial({ visible: false }));
    photo.position.z = 0;
    scene.add(photo);

    const caustics = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), buildCausticMaterial(THREE, mode, photoUniforms));
    caustics.position.z = 0.2;
    scene.add(caustics);

    const godRays = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), buildGodRayMaterial(THREE, mode, photoUniforms));
    godRays.position.z = 0.28;
    scene.add(godRays);

    const bubbleTexture = new THREE.CanvasTexture(makeBubbleCanvas());
    const bubblesTotal = bubbleCount();
    const bubblePositions = new Float32Array(bubblesTotal * 3);
    const bubbleSpeed = new Float32Array(bubblesTotal);
    const bubbleGeom = new THREE.BufferGeometry();
    bubbleGeom.setAttribute("position", new THREE.BufferAttribute(bubblePositions, 3));
    const bubbles = new THREE.Points(
        bubbleGeom,
        new THREE.PointsMaterial({
            map: bubbleTexture,
            transparent: true,
            depthWrite: false,
            size: 0.045,
            sizeAttenuation: true,
            color: 0xd8f4ff
        })
    );
    bubbles.position.z = 0.35;
    scene.add(bubbles);

    const fishColors = ["#f2d15c", "#e7f7ff"];
    const fishTextures = fishColors.map(function (fill) {
        const fishTexture = new THREE.CanvasTexture(makeFishCanvas(fill));
        fishTexture.colorSpace = THREE.SRGBColorSpace;
        return fishTexture;
    });
    const school = [];
    const totalFish = fishCount();
    for (let index = 0; index < totalFish; index += 1) {
        const map = fishTextures[index % fishTextures.length];
        let material = null;
        if (mode === "webgpu") {
            const tsl = THREE.TSL;
            material = new THREE.MeshBasicNodeMaterial();
            const sampled = tsl.texture(map);
            material.colorNode = sampled.rgb;
            material.opacityNode = sampled.a;
            material.transparent = true;
            material.depthWrite = false;
        } else {
            material = new THREE.MeshBasicMaterial({ map: map, transparent: true, depthWrite: false, alphaTest: 0.15 });
        }
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.09, 0.038), material);
        const fish = {
            mesh: mesh,
            velocity: new THREE.Vector2(Math.cos(index) * 0.05, Math.sin(index) * 0.05),
            slot: (index / totalFish) * Math.PI * 2,
            heading: Math.random() * Math.PI * 2,
            maxSpeed: 0.26 + (index % 5) * 0.025
        };
        mesh.scale.setScalar(0.85 + (index % 4) * 0.08);
        scene.add(mesh);
        school.push(fish);
    }

    const pointer = { x: 0, y: 0.2, sx: 0, sy: 0.2, active: false, movedAt: 0 };
    const parallax = { x: 0, y: 0 };
    let aspect = 1;
    let scroll = 0;
    let placed = false;

    function placeFish(fish) {
        // 画面内のランダムな位置から泳ぎ始める
        fish.mesh.position.x = (Math.random() - 0.5) * aspect * 2;
        fish.mesh.position.y = (Math.random() - 0.5) * 1.6;
        fish.mesh.position.z = 0.5;
    }

    function layout() {
        const width = window.innerWidth;
        const height = Math.max(window.innerHeight, 1);
        aspect = width / height;
        camera.left = -aspect;
        camera.right = aspect;
        camera.top = 1;
        camera.bottom = -1;
        camera.updateProjectionMatrix();
        renderer.setSize(width, height, false);
        photo.scale.set(aspect * 2, 2, 1);
        caustics.scale.set(aspect * 2, 2, 1);
        godRays.scale.set(aspect * 2, 2, 1);
        if (texture && texture.image) {
            const imageAspect = texture.image.width / texture.image.height;
            const repeat = coverRepeat(aspect, imageAspect);
            const aim = screenPoint();
            photoUniforms.uRepeat.value.set(repeat.x, repeat.y);
            // 絵の中の人物が、指定した画面位置に来るよう注視点を決める
            photoUniforms.uFocus.value.set(
                IMAGE_POINT.x - (aim.x - 0.5) * repeat.x,
                IMAGE_POINT.y - (aim.y - 0.5) * repeat.y
            );
        }
        if (!placed) {
            for (let index = 0; index < bubblesTotal; index += 1) {
                bubblePositions[index * 3] = (Math.random() - 0.5) * aspect * 2;
                bubblePositions[index * 3 + 1] = (Math.random() - 0.5) * 2;
                bubblePositions[index * 3 + 2] = 0;
                bubbleSpeed[index] = 0.04 + Math.random() * 0.07;
            }
            bubbleGeom.attributes.position.needsUpdate = true;
            school.forEach(placeFish);
            placed = true;
        }
        if (photoUniforms.gpuRepeat) {
            photoUniforms.gpuRepeat.value.copy(photoUniforms.uRepeat.value);
            photoUniforms.gpuFocus.value.copy(photoUniforms.uFocus.value);
        }
    }

    function onPointer(event) {
        const width = window.innerWidth;
        const height = Math.max(window.innerHeight, 1);
        // カーソルを水中の座標へ変換する
        pointer.x = ((event.clientX / width) * 2 - 1) * aspect;
        pointer.y = -((event.clientY / height) * 2 - 1);
        pointer.active = true;
        pointer.movedAt = performance.now();
        parallax.x += (((event.clientX / width) * 2 - 1) - parallax.x) * 0.08;
        parallax.y += (((event.clientY / height) * 2 - 1) - parallax.y) * 0.08;
    }

    function onScroll() {
        const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
        // ページ末尾に近いほど 1 に近づく
        scroll = maxScroll > 0 ? window.scrollY / maxScroll : 0;
    }

    layout();
    window.addEventListener("pointermove", onPointer, { passive: true });
    window.addEventListener("pointerdown", onPointer, { passive: true });
    window.addEventListener("resize", layout);
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();

    let last = performance.now();
    function tick(now) {
        frameId = window.requestAnimationFrame(tick);
        if (document.hidden) {
            last = now;
            return;
        }
        const dt = Math.min(0.05, (now - last) / 1000);
        last = now;
        photoUniforms.uTime.value += dt;
        // カーソルの細かい揺れを均してから、魚の目標にする
        pointer.sx += (pointer.x - pointer.sx) * Math.min(1, dt * 2.2);
        pointer.sy += (pointer.y - pointer.sy) * Math.min(1, dt * 2.2);
        const idle = !pointer.active || now - pointer.movedAt > 1600;
        const drift = now * 0.00012;
        photoUniforms.uParallax.value.set(parallax.x * 0.02, -parallax.y * 0.016 - scroll * 0.04);
        if (photoUniforms.gpuParallax) {
            photoUniforms.gpuParallax.value.copy(photoUniforms.uParallax.value);
        }
        school.forEach(function (fish) {
            const homeX = idle ? Math.cos(drift + fish.slot) * 0.45 : pointer.sx;
            const homeY = idle ? Math.sin(drift * 0.8 + fish.slot) * 0.28 : pointer.sy;
            const goalX = homeX + Math.cos(fish.slot) * 0.16;
            const goalY = homeY + Math.sin(fish.slot) * 0.09;
            let desiredX = goalX - fish.mesh.position.x;
            let desiredY = goalY - fish.mesh.position.y;
            const distance = Math.hypot(desiredX, desiredY) || 0.0001;
            // 近いほど減速して、その場で向きをパタつかせない
            const cruise = fish.maxSpeed * Math.min(1, distance / 0.35);
            desiredX = (desiredX / distance) * cruise;
            desiredY = (desiredY / distance) * cruise;
            fish.velocity.x += (desiredX - fish.velocity.x) * Math.min(1, dt * 1.15);
            fish.velocity.y += (desiredY - fish.velocity.y) * Math.min(1, dt * 1.15);
            const speed = Math.hypot(fish.velocity.x, fish.velocity.y) || 0.0001;
            if (speed > fish.maxSpeed) {
                fish.velocity.x = (fish.velocity.x / speed) * fish.maxSpeed;
                fish.velocity.y = (fish.velocity.y / speed) * fish.maxSpeed;
            }
            fish.mesh.position.x += fish.velocity.x * dt;
            fish.mesh.position.y += fish.velocity.y * dt;
            if (Math.abs(fish.mesh.position.x) > aspect + 0.15) {
                fish.velocity.x -= Math.sign(fish.mesh.position.x) * dt * 0.15;
            }
            if (Math.abs(fish.mesh.position.y) > 1.05) {
                fish.velocity.y -= Math.sign(fish.mesh.position.y) * dt * 0.15;
            }
            const aim = Math.atan2(fish.velocity.y, fish.velocity.x);
            let turn = aim - fish.heading;
            if (turn > Math.PI) {
                turn -= Math.PI * 2;
            }
            if (turn < -Math.PI) {
                turn += Math.PI * 2;
            }
            const maxTurn = 1.15 * dt;
            if (turn > maxTurn) {
                turn = maxTurn;
            }
            if (turn < -maxTurn) {
                turn = -maxTurn;
            }
            fish.heading += turn;
            fish.mesh.rotation.z = fish.heading;
        });
        for (let index = 0; index < bubblesTotal; index += 1) {
            let y = bubblePositions[index * 3 + 1] + bubbleSpeed[index] * dt;
            // 上まで昇ったら下から再登場させる
            if (y > 1.2) {
                y = -1.15;
                bubblePositions[index * 3] = (Math.random() - 0.5) * aspect * 2;
            }
            bubblePositions[index * 3 + 1] = y;
        }
        bubbleGeom.attributes.position.needsUpdate = true;
        renderer.render(scene, camera);
        if (!document.body.classList.contains("has-scene")) {
            document.body.classList.add("has-scene");
        }
        if (texture && !document.body.classList.contains("has-photo")) {
            document.body.classList.add("has-photo");
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
        scene.traverse(function (object) {
            if (object.geometry) {
                object.geometry.dispose();
            }
            if (object.material) {
                const materials = Array.isArray(object.material) ? object.material : [object.material];
                materials.forEach(function (material) {
                    material.dispose();
                });
            }
        });
        fishTextures.forEach(function (item) {
            item.dispose();
        });
        bubbleTexture.dispose();
        if (texture) {
            texture.dispose();
        }
        renderer.dispose();
        disposeScene = null;
        running = false;
    };
    } catch (error) {
        // 構築に失敗したら絵だけ残す
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
    // 再生中のシーンだけ止める
    if (disposeScene) {
        disposeScene();
    }
    running = false;
}

function sync() {
    // 品質と reduced-motion に合わせて開始または停止
    if (motionAllowed()) {
        boot();
    } else {
        stop();
    }
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
