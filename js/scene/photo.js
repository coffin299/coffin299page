// 奥の図書室と、階段に座る人物。失敗時は一枚絵に戻す。

import { screenNode, WAVE_GLSL } from "./refraction.js";

const SEAT_UV = { x: 0.57, y: 0.4 };
// 背景テクスチャ上で、腰を乗せる段
const STAIR_UV = { x: 0.8, y: 0.32 };
const FALLBACK_POINT = { x: 0.66, y: 0.4 };
// ポインタとスクロールで絵をずらす量。端いっぱいだとこの分だけ動けない
const LOOK_X = 0.01;
const LOOK_Y = 0.006;
const SCROLL_Y = 0.016;

function coverRepeat(viewAspect, imageAspect) {
    if (viewAspect > imageAspect) {
        return { x: 1, y: imageAspect / viewAspect };
    }
    return { x: viewAspect / imageAspect, y: 1 };
}

function reserveParallax(repeat) {
    // 横も縦も、視差の最大量だけは端を残す。16:9 は横が埋まり左右が止まる
    const needX = LOOK_X;
    const needY = LOOK_Y + SCROLL_Y;
    let x = repeat.x;
    let y = repeat.y;
    if ((1 - x) * 0.5 < needX) {
        x = 1 - needX * 2;
    }
    if ((1 - y) * 0.5 < needY) {
        y = 1 - needY * 2;
    }
    return { x: x, y: y };
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

function stairOnScreen(focus, repeat) {
    // 段の画素が、今の切り抜きのどこに映るか
    return {
        x: (STAIR_UV.x - focus.x) / repeat.x + 0.5,
        y: (STAIR_UV.y - focus.y) / repeat.y + 0.5
    };
}

function clampScreen(value, min, max) {
    // 収まる範囲が無いときは中央に置く
    if (min > max) {
        return (min + max) * 0.5;
    }
    return Math.min(Math.max(value, min), max);
}

function fitDesktopSeat(aspect, repeat, avatarAspect) {
    const desktopH = 1.2;
    const viewW = aspect * 2;
    // 16:9での横幅の割合を保ち、細い窓ではその分だけ縮む
    const widthFraction = (desktopH * avatarAspect) / ((16 / 9) * 2);
    const planeW = Math.min(desktopH * avatarAspect, viewW * widthFraction);
    const planeH = planeW / avatarAspect;
    const centered = clampFocus({ x: 0.5, y: 0.5 }, repeat);
    const natural = stairOnScreen(centered, repeat);
    // 腰を段に置いたまま、全身が画面の中に入る位置へ寄せる
    const minX = (SEAT_UV.x * planeW) / viewW;
    const maxX = 1 - ((1 - SEAT_UV.x) * planeW) / viewW;
    const minY = (SEAT_UV.y * planeH) / 2;
    const maxY = 1 - ((1 - SEAT_UV.y) * planeH) / 2;
    const screen = {
        x: clampScreen(natural.x, minX, maxX),
        y: clampScreen(natural.y, minY, maxY)
    };
    const focus = clampFocus({
        x: STAIR_UV.x - (screen.x - 0.5) * repeat.x,
        y: STAIR_UV.y - (screen.y - 0.5) * repeat.y
    }, repeat);
    return { planeW: planeW, planeH: planeH, focus: focus };
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
            if (mobile) {
                // スマホは階段のあたりを大きく映す。人物は見切れてもよい
                const zoom = plates.layered ? 0.7 : 0.8;
                repeat = { x: repeat.x * zoom, y: repeat.y * zoom };
            }
            // 端まで使い切ると、その軸の視差がクランプで消える
            repeat = reserveParallax(repeat);
            uniforms.uRepeat.value.set(repeat.x, repeat.y);
            if (plates.layered) {
                if (mobile) {
                    // 段が画面の右寄り中央に来るよう、切り抜きの中心を決める
                    const aim = { x: 0.7, y: 0.5 };
                    focusBase.x = STAIR_UV.x - (aim.x - 0.5) * repeat.x;
                    focusBase.y = STAIR_UV.y - (aim.y - 0.5) * repeat.y;
                }
                const avatarAspect = plates.avatar.image.width / plates.avatar.image.height;
                let planeW = 0;
                let planeH = 0;
                if (mobile) {
                    const fitted = clampFocus(focusBase, repeat);
                    focusBase.x = fitted.x;
                    focusBase.y = fitted.y;
                    // スマホは画面いっぱいに大きく出す
                    planeH = 1.55;
                    planeW = planeH * avatarAspect;
                } else {
                    // 窓を狭めても段に付いたまま、画面内に収まる大きさにする
                    const fitted = fitDesktopSeat(aspect, repeat, avatarAspect);
                    focusBase.x = fitted.focus.x;
                    focusBase.y = fitted.focus.y;
                    planeW = fitted.planeW;
                    planeH = fitted.planeH;
                }
                uniforms.uFocus.value.set(focusBase.x, focusBase.y);
                const screen = stairOnScreen(focusBase, repeat);
                const seatX = (screen.x - 0.5) * 2 * aspect;
                const seatY = (screen.y - 0.5) * 2;
                avatar.scale.set(planeW, planeH, 1);
                // テクスチャ上の腰を、背景の段の画素に合わせる
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
            const shiftX = input.look.x * LOOK_X;
            const shiftY = -input.look.y * LOOK_Y - input.scroll * SCROLL_Y;
            const repeat = uniforms.uRepeat.value;
            // 毎フレーム基準位置から足し、絵の外にはみ出したら端で止める
            const next = clampFocus({ x: focusBase.x + shiftX, y: focusBase.y + shiftY }, repeat);
            uniforms.uFocus.value.set(next.x, next.y);
            if (uniforms.gpuFocus) {
                uniforms.gpuFocus.value.copy(uniforms.uFocus.value);
            }
            if (avatar) {
                // 奥が動いた分と同じだけ動かし、腰を段から離さない
                const movedX = next.x - focusBase.x;
                const movedY = next.y - focusBase.y;
                const roomX = repeat.x > 0 ? -(movedX / repeat.x) * 2 * input.aspect : 0;
                const roomY = repeat.y > 0 ? -(movedY / repeat.y) * 2 : 0;
                avatar.position.x = base.x + roomX;
                avatar.position.y = base.y + roomY;
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
