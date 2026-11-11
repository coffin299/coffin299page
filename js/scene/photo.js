// 奥の図書室と、階段に座る人物。失敗時は一枚絵に戻す。

import { screenNode, WAVE_GLSL } from "./refraction.js";

const SEAT_UV = { x: 0.68, y: 0.4 };
const FALLBACK_POINT = { x: 0.66, y: 0.4 };

function coverRepeat(viewAspect, imageAspect) {
    if (viewAspect > imageAspect) {
        return { x: 1, y: imageAspect / viewAspect };
    }
    return { x: viewAspect / imageAspect, y: 1 };
}

function clampFocus(focus, repeat) {
    // repeat が 1 未満の軸だけ動かせる。外へ出すと端の1行が帯になって伸びる
    const halfX = repeat.x * 0.5;
    const halfY = repeat.y * 0.5;
    return {
        x: Math.min(Math.max(focus.x, halfX), 1 - halfX),
        y: Math.min(Math.max(focus.y, halfY), 1 - halfY)
    };
}

function prepareTexture(THREE, texture) {
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.generateMipmaps = false;
    return texture;
}

async function loadOne(THREE, url) {
    const texture = await new THREE.TextureLoader().loadAsync(url);
    return prepareTexture(THREE, texture);
}

export async function loadPlates(THREE, world) {
    const roomUrl = world.dataset.room;
    const avatarUrl = world.dataset.avatar;
    if (roomUrl && avatarUrl) {
        try {
            const room = await loadOne(THREE, roomUrl);
            const avatar = await loadOne(THREE, avatarUrl);
            return { layered: true, room: room, avatar: avatar };
        } catch (error) {
            console.warn("二層画像を読めなかったため一枚絵に戻します", error);
        }
    }
    const photo = await loadOne(THREE, world.dataset.photo);
    return { layered: false, photo: photo };
}

function fullscreenVertex() {
    return [
        "varying vec2 vUv;",
        "void main() {",
        "  vUv = uv;",
        "  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);",
        "}"
    ].join("\n");
}

function buildRoomMaterial(THREE, mode, texture, waves, uniforms, layered) {
    if (mode === "webgpu") {
        const tsl = THREE.TSL;
        const material = new THREE.MeshBasicNodeMaterial();
        const uvNode = tsl.uv();
        const repeat = tsl.uniform(uniforms.uRepeat.value);
        const focus = tsl.uniform(uniforms.uFocus.value);
        uniforms.gpuRepeat = repeat;
        uniforms.gpuFocus = focus;
        const baseUv = uvNode.sub(0.5).mul(repeat).add(focus);
        // 高さ場で UV を動かすと図書室が二重に見える。絵はそのまま出す
        material.colorNode = tsl.texture(texture, tsl.clamp(baseUv, 0.001, 0.999)).rgb;
        material.depthWrite = true;
        material.toneMapped = false;
        return material;
    }
    uniforms.uMap.value = texture;
    uniforms.uWave.value = waves.texture ? waves.texture.value : null;
    uniforms.uWaveTexel.value = waves.texel;
    uniforms.uLayered.value = layered ? 1 : 0;
    return new THREE.ShaderMaterial({
        uniforms: uniforms,
        depthWrite: true,
        toneMapped: false,
        vertexShader: fullscreenVertex(),
        fragmentShader: [
            "precision highp float;",
            "uniform sampler2D uMap;",
            "uniform vec2 uRepeat;",
            "uniform vec2 uFocus;",
            "uniform float uLayered;",
            WAVE_GLSL,
            "varying vec2 vUv;",
            "void main() {",
            "  vec2 baseUv = clamp((vUv - 0.5) * uRepeat + uFocus, 0.001, 0.999);",
            "  gl_FragColor = vec4(texture2D(uMap, baseUv).rgb, 1.0);",
            "}"
        ].join("\n")
    });
}

function buildAvatarMaterial(THREE, mode, texture) {
    if (mode === "webgpu") {
        const tsl = THREE.TSL;
        const material = new THREE.MeshBasicNodeMaterial();
        const sampled = tsl.texture(texture);
        material.colorNode = sampled.rgb;
        material.opacityNode = sampled.a;
        material.transparent = true;
        material.alphaTest = 0.04;
        material.depthWrite = true;
        material.toneMapped = false;
        return material;
    }
    return new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        alphaTest: 0.04,
        depthWrite: true,
        toneMapped: false
    });
}

function seatScreen() {
    if (window.matchMedia("(max-width: 800px)").matches) {
        return { x: 0.61, y: 0.47 };
    }
    // 腰を一段上、本棚側の段に乗せる
    return { x: 0.73, y: 0.35 };
}

function fallbackAim() {
    if (window.matchMedia("(max-width: 800px)").matches) {
        return { x: 0.5, y: 0.48 };
    }
    return { x: 0.76, y: 0.36 };
}

export function createPhoto(THREE, mode, plates, waves, worldScene, avatarScene) {
    const uniforms = {
        uMap: { value: plates.room || plates.photo },
        uWave: { value: waves.texture ? waves.texture.value : null },
        uWaveTexel: { value: waves.texel },
        uRepeat: { value: new THREE.Vector2(1, 1) },
        uFocus: { value: new THREE.Vector2(0.5, 0.42) },
        uLayered: { value: plates.layered ? 1 : 0 },
        uTime: { value: 0 }
    };
    const roomTexture = plates.layered ? plates.room : plates.photo;
    const room = new THREE.Mesh(
        new THREE.PlaneGeometry(1, 1),
        buildRoomMaterial(THREE, mode, roomTexture, waves, uniforms, plates.layered)
    );
    room.position.z = 0;
    room.frustumCulled = false;
    worldScene.add(room);
    let avatar = null;
    if (plates.layered) {
        avatar = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), buildAvatarMaterial(THREE, mode, plates.avatar));
        avatar.position.z = 0.78;
        avatar.frustumCulled = false;
        avatarScene.add(avatar);
    }
    const base = { x: 0, y: 0 };
    const focusBase = { x: 0.5, y: 0.42 };
    return {
        uniforms: uniforms,
        avatar: avatar,
        layout: function (aspect) {
            room.scale.set(aspect * 2, 2, 1);
            const image = roomTexture.image;
            if (!image) {
                return;
            }
            const imageAspect = image.width / image.height;
            const mobile = window.matchMedia("(max-width: 800px)").matches;
            let repeat = coverRepeat(aspect, imageAspect);
            if (mobile && !plates.layered) {
                // 一枚絵のスマホは人物が主役になるよう少し寄る
                repeat = { x: repeat.x * 0.8, y: repeat.y * 0.8 };
            }
            uniforms.uRepeat.value.set(repeat.x, repeat.y);
            if (plates.layered) {
                focusBase.x = 0.5;
                focusBase.y = mobile ? 0.46 : 0.42;
                const fitted = clampFocus(focusBase, repeat);
                focusBase.x = fitted.x;
                focusBase.y = fitted.y;
                uniforms.uFocus.value.set(focusBase.x, focusBase.y);
                const planeH = mobile ? 1.55 : 1.2;
                const planeW = planeH * (plates.avatar.image.width / plates.avatar.image.height);
                const screen = seatScreen();
                const seatX = (screen.x - 0.5) * 2 * aspect;
                const seatY = (screen.y - 0.5) * 2;
                avatar.scale.set(planeW, planeH, 1);
                // テクスチャ上の腰が、画面上の階段位置に来るよう平面をずらす
                base.x = seatX - (SEAT_UV.x - 0.5) * planeW;
                base.y = seatY - (SEAT_UV.y - 0.5) * planeH;
            } else {
                const aim = fallbackAim();
                focusBase.x = FALLBACK_POINT.x - (aim.x - 0.5) * repeat.x;
                focusBase.y = FALLBACK_POINT.y - (aim.y - 0.5) * repeat.y;
                uniforms.uFocus.value.set(focusBase.x, focusBase.y);
            }
            if (uniforms.gpuRepeat) {
                uniforms.gpuRepeat.value.copy(uniforms.uRepeat.value);
            }
        },
        parallax: function (input) {
            const shiftX = input.look.x * 0.018;
            const shiftY = -input.look.y * 0.012 - input.scroll * 0.028;
            const repeat = uniforms.uRepeat.value;
            // 毎フレーム基準位置から足し、絵の外にはみ出したら端で止める
            const next = clampFocus({ x: focusBase.x + shiftX, y: focusBase.y + shiftY }, repeat);
            uniforms.uFocus.value.set(next.x, next.y);
            if (uniforms.gpuFocus) {
                uniforms.gpuFocus.value.copy(uniforms.uFocus.value);
            }
            if (avatar) {
                // 奥が実際に動いた分だけ、同じ方向へ少し追従させる
                const movedX = next.x - focusBase.x;
                const movedY = next.y - focusBase.y;
                const roomX = repeat.x > 0 ? -(movedX / repeat.x) * 2 * input.aspect : 0;
                const roomY = repeat.y > 0 ? -(movedY / repeat.y) * 2 : 0;
                avatar.position.x = base.x + roomX * 0.4;
                avatar.position.y = base.y + roomY * 0.4;
            }
        },
        syncWave: function () {
            if (uniforms.uWave && waves.texture) {
                uniforms.uWave.value = waves.texture.value;
            }
        },
        dispose: function () {
            room.geometry.dispose();
            room.material.dispose();
            if (avatar) {
                avatar.geometry.dispose();
                avatar.material.dispose();
            }
            if (plates.room) {
                plates.room.dispose();
            }
            if (plates.avatar) {
                plates.avatar.dispose();
            }
            if (plates.photo) {
                plates.photo.dispose();
            }
        }
    };
}

export { screenNode };
