// 奥の図書室と、階段に座る人物。失敗時は一枚絵に戻す。

import { causticAmount, screenNode, WAVE_GLSL, waveGradient } from "./refraction.js";

const SEAT_UV = { x: 0.68, y: 0.4 };
const FALLBACK_POINT = { x: 0.66, y: 0.4 };

function coverRepeat(viewAspect, imageAspect) {
    if (viewAspect > imageAspect) {
        return { x: 1, y: imageAspect / viewAspect };
    }
    return { x: viewAspect / imageAspect, y: 1 };
}

function prepareTexture(THREE, texture) {
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
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
        let sampleUv = baseUv;
        if (waves.sample) {
            const grad = waveGradient(tsl, waves.sample, uvNode, waves.texel);
            if (layered) {
                // 奥の図書室だけ、絵が割れない程度にわずかに屈折させる
                sampleUv = baseUv.add(grad.mul(0.03));
            } else {
                const delta = baseUv.sub(tsl.vec2(FALLBACK_POINT.x, FALLBACK_POINT.y)).div(tsl.vec2(0.16, 0.28));
                const away = tsl.smoothstep(tsl.float(0.35), tsl.float(1.05), tsl.length(delta));
                sampleUv = baseUv.add(grad.mul(0.02).mul(away));
            }
        }
        const sampled = tsl.texture(texture, tsl.clamp(sampleUv, 0.001, 0.999));
        let color = sampled.rgb;
        if (waves.sample) {
            const light = causticAmount(tsl, waves.sample, uvNode, waves.texel);
            color = color.add(tsl.vec3(0.35, 0.7, 0.85).mul(light).mul(0.04));
        }
        material.colorNode = color;
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
            "  vec2 baseUv = (vUv - 0.5) * uRepeat + uFocus;",
            "  vec2 grad = waveGradient(vUv);",
            "  float away = 1.0;",
            "  if (uLayered < 0.5) {",
            "    vec2 delta = (baseUv - vec2(0.66, 0.40)) / vec2(0.16, 0.28);",
            "    away = smoothstep(0.35, 1.05, length(delta));",
            "  }",
            "  vec2 sampleUv = clamp(baseUv + grad * mix(0.02, 0.03, uLayered) * away, 0.001, 0.999);",
            "  vec3 color = texture2D(uMap, sampleUv).rgb;",
            "  color += vec3(0.35, 0.70, 0.85) * causticAmount(vUv) * 0.04;",
            "  gl_FragColor = vec4(color, 1.0);",
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
        return { x: 0.5, y: 0.4 };
    }
    return { x: 0.6, y: 0.28 };
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
            // 毎フレーム基準位置から足し、視差が蓄積しないようにする
            uniforms.uFocus.value.set(focusBase.x + shiftX, focusBase.y + shiftY);
            if (uniforms.gpuFocus) {
                uniforms.gpuFocus.value.copy(uniforms.uFocus.value);
            }
            if (avatar) {
                // 奥より小さく動かし、階段から大きく外れないようにする
                avatar.position.x = base.x + input.look.x * input.aspect * 0.012;
                avatar.position.y = base.y - input.look.y * 0.008 - input.scroll * 0.012;
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
