// WebGPU は描画結果をノードで合成する。Low と WebGL はフォグ、歪み、軽い色収差だけ。

import { WAVE_GLSL, waveGradient } from "./refraction.js";

function fogged(tsl, color, uv) {
    const amount = tsl.float(1).sub(uv.y).mul(0.18).add(0.06);
    return tsl.mix(color, tsl.vec3(0.02, 0.14, 0.24), amount);
}

export async function createPost(THREE, renderer, mode, tier, worldScene, camera, waves) {
    if (mode === "webgpu" && THREE.TSL) {
        try {
            const tsl = THREE.TSL;
            const target = new THREE.RenderTarget(2, 2, { depthBuffer: true });
            target.texture.wrapS = THREE.ClampToEdgeWrapping;
            target.texture.wrapT = THREE.ClampToEdgeWrapping;
            const material = new THREE.MeshBasicNodeMaterial();
            const uv = tsl.uv();
            let sampleUv = uv;
            if (waves.sample) {
                const grad = waveGradient(tsl, waves.sample, uv, waves.texel);
                // 奥の絵だけをわずかに歪ませる。人物はこの後に重ねる
                sampleUv = tsl.clamp(uv.add(grad.mul(0.01)), 0.001, 0.999);
            }
            let color = tsl.texture(target.texture, sampleUv).rgb;
            if (tier === "high") {
                const center = sampleUv.sub(0.5);
                const edge = tsl.length(center).mul(0.0016);
                const red = tsl.texture(target.texture, tsl.clamp(sampleUv.add(center.mul(edge)), 0.001, 0.999)).r;
                const blue = tsl.texture(target.texture, tsl.clamp(sampleUv.sub(center.mul(edge)), 0.001, 0.999)).b;
                color = tsl.vec3(red, color.g, blue);
                const glow = tsl.texture(target.texture, sampleUv).rgb;
                // 明るい画素だけ足して、高しきい値のブルームにする
                color = color.add(tsl.max(glow.sub(0.9), tsl.vec3(0, 0, 0)).mul(0.22));
                const spread = tsl.smoothstep(tsl.float(0.35), tsl.float(1), uv.y).mul(0.0011);
                const tap = function (x, y) {
                    return tsl.texture(target.texture, tsl.clamp(sampleUv.add(tsl.vec2(x, y).mul(spread)), 0.001, 0.999)).rgb;
                };
                const blurred = tap(1, 0).add(tap(-1, 0)).add(tap(0, 1)).add(tap(0, -1)).add(color).div(5);
                // 画面上だけ少し柔らかくし、階段側の人物は後からシャープに重ねる
                color = tsl.mix(color, blurred, tsl.smoothstep(tsl.float(0.4), tsl.float(1), uv.y).mul(0.22));
            }
            material.colorNode = fogged(tsl, color, uv);
            material.depthTest = false;
            material.depthWrite = false;
            material.toneMapped = false;
            const scene = new THREE.Scene();
            const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
            mesh.frustumCulled = false;
            scene.add(mesh);
            const quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
            return {
                kind: "webgpu",
                render: function (renderer, sourceScene, sourceCamera) {
                    renderer.setRenderTarget(target);
                    renderer.setClearColor(0x041422, 1);
                    renderer.clear();
                    renderer.render(sourceScene, sourceCamera);
                    renderer.setRenderTarget(null);
                    renderer.render(scene, quadCamera);
                },
                setSize: function (width, height) {
                    target.setSize(Math.max(2, width), Math.max(2, height));
                },
                dispose: function () {
                    target.dispose();
                    material.dispose();
                    mesh.geometry.dispose();
                }
            };
        } catch (error) {
            console.warn("WebGPU のポストプロセスを作れなかったため直接描画します", error);
        }
    }
    if (mode === "webgl") {
        const target = new THREE.WebGLRenderTarget(2, 2, { depthBuffer: true });
        const uniforms = {
            uScene: { value: target.texture },
            uWave: { value: waves.texture ? waves.texture.value : null },
            uWaveTexel: { value: waves.texel }
        };
        const material = new THREE.ShaderMaterial({
            uniforms: uniforms,
            depthTest: false,
            depthWrite: false,
            toneMapped: false,
            vertexShader: [
                "varying vec2 vUv;",
                "void main() {",
                "  vUv = uv;",
                "  gl_Position = vec4(position.xy, 0.0, 1.0);",
                "}"
            ].join("\n"),
            fragmentShader: [
                "precision highp float;",
                "uniform sampler2D uScene;",
                WAVE_GLSL,
                "varying vec2 vUv;",
                "void main() {",
                "  vec2 grad = waveGradient(vUv);",
                "  vec2 uv = vUv + grad * 0.012;",
                "  vec2 center = uv - 0.5;",
                "  float edge = length(center);",
                "  float r = texture2D(uScene, uv + center * edge * 0.004).r;",
                "  float g = texture2D(uScene, uv).g;",
                "  float b = texture2D(uScene, uv - center * edge * 0.004).b;",
                "  vec3 color = vec3(r, g, b);",
                "  float fog = (1.0 - vUv.y) * 0.18 + 0.06;",
                "  color = mix(color, vec3(0.02, 0.14, 0.24), fog);",
                "  gl_FragColor = vec4(color, 1.0);",
                "}"
            ].join("\n")
        });
        const scene = new THREE.Scene();
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
        mesh.frustumCulled = false;
        scene.add(mesh);
        const quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
        return {
            kind: "webgl",
            target: target,
            syncWave: function () {
                if (waves.texture) {
                    uniforms.uWave.value = waves.texture.value;
                }
            },
            render: function (renderer, worldScene, worldCamera) {
                renderer.setRenderTarget(target);
                renderer.render(worldScene, worldCamera);
                renderer.setRenderTarget(null);
                renderer.render(scene, quadCamera);
            },
            setSize: function (width, height) {
                target.setSize(Math.max(2, width), Math.max(2, height));
            },
            dispose: function () {
                target.dispose();
                material.dispose();
                mesh.geometry.dispose();
            }
        };
    }
    return {
        kind: "direct",
        render: function (renderer, worldScene, worldCamera) {
            renderer.setRenderTarget(null);
            renderer.render(worldScene, worldCamera);
        },
        setSize: function () {},
        dispose: function () {}
    };
}
