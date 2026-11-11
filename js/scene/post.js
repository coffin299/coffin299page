// WebGPU は描画結果をノードで合成する。Low と WebGL はフォグ、歪み、軽い色収差だけ。

import { WAVE_GLSL } from "./refraction.js";

export async function createPost(THREE, renderer, mode, tier, worldScene, camera, waves) {
    if (mode === "webgpu" && THREE.TSL) {
        try {
            const tsl = THREE.TSL;
            const target = new THREE.RenderTarget(2, 2, { depthBuffer: true });
            target.texture.wrapS = THREE.ClampToEdgeWrapping;
            target.texture.wrapT = THREE.ClampToEdgeWrapping;
            const material = new THREE.MeshBasicNodeMaterial();
            const uv = tsl.uv();
            // 描画先テクスチャは上が逆なので、図書室が元絵と同じ向きになるよう戻す
            const sampleUv = tsl.vec2(uv.x, tsl.float(1).sub(uv.y));
            material.colorNode = tsl.texture(target.texture, sampleUv).rgb;
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
                "  gl_FragColor = texture2D(uScene, vUv);",
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
