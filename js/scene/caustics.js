// 高さ場を床と左右の壁へ投影する。人物には掛けない。

import { causticAmount, WAVE_GLSL } from "./refraction.js";

function buildMaterial(THREE, mode, waves) {
    if (mode === "webgpu" && waves.sample) {
        const tsl = THREE.TSL;
        const material = new THREE.MeshBasicNodeMaterial();
        const uvNode = typeof tsl.screenUV === "function" ? tsl.screenUV() : tsl.uv();
        const light = causticAmount(tsl, waves.sample, uvNode, waves.texel);
        const fade = tsl.smoothstep(tsl.float(0.0), tsl.float(0.25), tsl.uv().y);
        material.colorNode = tsl.vec3(0.55, 0.9, 1.0).mul(light);
        material.opacityNode = light.mul(fade).mul(0.07);
        material.transparent = true;
        material.depthWrite = false;
        material.blending = THREE.AdditiveBlending;
        material.toneMapped = false;
        return material;
    }
    return new THREE.ShaderMaterial({
        uniforms: {
            uWave: { value: waves.texture ? waves.texture.value : null },
            uWaveTexel: { value: waves.texel }
        },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
        vertexShader: [
            "varying vec2 vUv;",
            "varying vec2 vScreen;",
            "void main() {",
            "  vUv = uv;",
            "  vec4 clip = projectionMatrix * modelViewMatrix * vec4(position, 1.0);",
            "  vScreen = clip.xy / clip.w * 0.5 + 0.5;",
            "  gl_Position = clip;",
            "}"
        ].join("\n"),
        fragmentShader: [
            "precision highp float;",
            WAVE_GLSL,
            "varying vec2 vUv;",
            "varying vec2 vScreen;",
            "void main() {",
            "  float light = causticAmount(vScreen);",
            "  float fade = smoothstep(0.0, 0.25, vUv.y);",
            "  gl_FragColor = vec4(0.55, 0.90, 1.0, light * fade * 0.07);",
            "}"
        ].join("\n")
    });
}

export function createCaustics(THREE, mode, waves, worldScene) {
    const material = buildMaterial(THREE, mode, waves);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material);
    const left = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material);
    const right = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material);
    floor.position.z = 0.16;
    left.position.z = 0.16;
    right.position.z = 0.16;
    floor.frustumCulled = false;
    left.frustumCulled = false;
    right.frustumCulled = false;
    worldScene.add(floor);
    worldScene.add(left);
    worldScene.add(right);
    const meshes = [floor, left, right];
    return {
        layout: function (aspect) {
            floor.scale.set(aspect * 2, 0.62, 1);
            floor.position.y = -0.69;
            left.scale.set(0.42, 2, 1);
            left.position.x = -aspect + 0.12;
            right.scale.set(0.42, 2, 1);
            right.position.x = aspect - 0.12;
        },
        syncWave: function () {
            if (material.uniforms && material.uniforms.uWave && waves.texture) {
                material.uniforms.uWave.value = waves.texture.value;
            }
        },
        dispose: function () {
            meshes.forEach(function (mesh) {
                mesh.geometry.dispose();
            });
            material.dispose();
        }
    };
}
