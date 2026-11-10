// 水面から降りてくる光芒。固定段数で視線に沿って足す。

const RAY_GLSL = [
    "precision highp float;",
    "uniform float uTime;",
    "uniform vec2 uCam;",
    "uniform float uWaveTop;",
    "varying vec2 vUv;",
    "float shaft(vec2 p) {",
    "  float down = 1.0 - p.y;",
    "  float spread = (p.x - 0.5) / (down * 0.75 + 0.18);",
    "  float sway = uTime * 0.15 + uCam.x * 0.45;",
    "  float ray = 0.0;",
    "  ray += 1.0 - smoothstep(0.0, 0.16, abs(spread - sin(sway) * 0.18));",
    "  ray += 1.0 - smoothstep(0.0, 0.10, abs(spread - (cos(sway * 0.8) * 0.20 + 0.28)));",
    "  ray += 1.0 - smoothstep(0.0, 0.13, abs(spread - (sin(sway * 0.6) * 0.16 - 0.32)));",
    "  ray += 1.0 - smoothstep(0.0, 0.08, abs(spread - (cos(sway * 1.2) * 0.10 + 0.08)));",
    "  return ray;",
    "}",
    "void main() {",
    "  vec2 light = vec2(0.48 + uCam.x * 0.08, 1.04);",
    "  vec2 toFrag = vUv - light;",
    "  float acc = 0.0;",
    "  for (int i = 0; i < 8; i++) {",
    "    vec2 p = light + toFrag * (float(i) + 0.5) / 8.0;",
    "    acc += shaft(p);",
    "  }",
    "  float fade = smoothstep(1.05, 0.02, 1.0 - vUv.y);",
    "  float alpha = clamp(acc * 0.04, 0.0, 0.48) * fade * (0.82 + uWaveTop * 0.5);",
    "  gl_FragColor = vec4(0.75, 0.92, 1.0, alpha);",
    "}"
].join("\n");

function buildMaterial(THREE, mode, uniforms) {
    if (mode === "webgpu") {
        const tsl = THREE.TSL;
        const uvNode = tsl.uv();
        const time = tsl.uniform(0);
        const cam = tsl.uniform(new THREE.Vector2());
        const waveTop = tsl.uniform(0);
        uniforms.gpuTime = time;
        uniforms.gpuCam = cam;
        uniforms.gpuWaveTop = waveTop;
        const light = tsl.vec2(tsl.float(0.48).add(cam.x.mul(0.08)), tsl.float(1.04));
        const toFrag = uvNode.sub(light);
        let acc = tsl.float(0);
        for (let step = 0; step < 8; step += 1) {
            const p = light.add(toFrag.mul((step + 0.5) / 8));
            const down = tsl.float(1).sub(p.y);
            const spread = p.x.sub(0.5).div(down.mul(0.75).add(0.18));
            const sway = time.mul(0.15).add(cam.x.mul(0.45));
            const bands = [
                [sway.sin().mul(0.18), 0.16],
                [sway.mul(0.8).cos().mul(0.2).add(0.28), 0.1],
                [sway.mul(0.6).sin().mul(0.16).sub(0.32), 0.13],
                [sway.mul(1.2).cos().mul(0.1).add(0.08), 0.08]
            ];
            let ray = tsl.float(0);
            for (let band = 0; band < bands.length; band += 1) {
                const gap = spread.sub(bands[band][0]).abs();
                ray = ray.add(tsl.float(1).sub(tsl.smoothstep(tsl.float(0), tsl.float(bands[band][1]), gap)));
            }
            acc = acc.add(ray);
        }
        const fade = tsl.smoothstep(tsl.float(1.05), tsl.float(0.02), tsl.float(1).sub(uvNode.y));
        const alpha = tsl.clamp(acc.mul(0.04), 0, 0.48).mul(fade).mul(waveTop.mul(0.5).add(0.82));
        const material = new THREE.MeshBasicNodeMaterial();
        material.colorNode = tsl.vec3(0.75, 0.92, 1.0);
        material.opacityNode = alpha;
        material.transparent = true;
        material.depthWrite = false;
        material.depthTest = false;
        material.blending = THREE.AdditiveBlending;
        material.toneMapped = false;
        return material;
    }
    return new THREE.ShaderMaterial({
        uniforms: uniforms,
        transparent: true,
        depthWrite: false,
        depthTest: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
        vertexShader: [
            "varying vec2 vUv;",
            "void main() {",
            "  vUv = uv;",
            "  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);",
            "}"
        ].join("\n"),
        fragmentShader: RAY_GLSL
    });
}

export function createVolume(THREE, mode, worldScene) {
    const uniforms = {
        uTime: { value: 0 },
        uCam: { value: new THREE.Vector2() },
        uWaveTop: { value: 0.2 }
    };
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), buildMaterial(THREE, mode, uniforms));
    mesh.position.z = 0.24;
    mesh.frustumCulled = false;
    worldScene.add(mesh);
    return {
        layout: function (aspect) {
            mesh.scale.set(aspect * 2, 2, 1);
        },
        update: function (input) {
            uniforms.uTime.value = input.time;
            uniforms.uCam.value.set(input.look.x, input.look.y);
            uniforms.uWaveTop.value = 0.2 + Math.min(0.8, input.impulse * 3);
            if (uniforms.gpuTime) {
                uniforms.gpuTime.value = input.time;
                uniforms.gpuCam.value.copy(uniforms.uCam.value);
                uniforms.gpuWaveTop.value = uniforms.uWaveTop.value;
            }
        },
        dispose: function () {
            mesh.geometry.dispose();
            mesh.material.dispose();
        }
    };
}
