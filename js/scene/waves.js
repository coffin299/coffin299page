// カーソルの波紋。WebGPU はコンピュート、WebGL はピンポンのフラグメントシェーダ。

function fillSeed(size) {
    const data = new Float32Array(size * size * 2);
    for (let y = 0; y < size; y += 1) {
        for (let x = 0; x < size; x += 1) {
            const u = x / size;
            const v = y / size;
            // 0.5 を静止水面にし、最初から光の筋が出るように少し波打たせる
            const h = 0.5 + Math.sin(u * Math.PI * 6) * Math.sin(v * Math.PI * 5) * 0.02;
            const index = (y * size + x) * 2;
            data[index] = h;
            data[index + 1] = h;
        }
    }
    return data;
}

function createWebGLWaves(THREE, size) {
    const makeTarget = function () {
        const target = new THREE.WebGLRenderTarget(size, size, {
            depthBuffer: false,
            magFilter: THREE.LinearFilter,
            minFilter: THREE.LinearFilter
        });
        return target;
    };
    const read = makeTarget();
    const write = makeTarget();
    const uniforms = {
        uPrev: { value: read.texture },
        uPointer: { value: new THREE.Vector2(0.5, 0.5) },
        uImpulse: { value: 0 },
        uTime: { value: 0 },
        uTexel: { value: 1 / size }
    };
    const material = new THREE.ShaderMaterial({
        uniforms: uniforms,
        depthTest: false,
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
            "uniform sampler2D uPrev;",
            "uniform vec2 uPointer;",
            "uniform float uImpulse;",
            "uniform float uTime;",
            "uniform float uTexel;",
            "varying vec2 vUv;",
            "void main() {",
            "  vec2 texel = vec2(uTexel);",
            "  float leftH = texture2D(uPrev, vUv - vec2(texel.x, 0.0)).r;",
            "  float rightH = texture2D(uPrev, vUv + vec2(texel.x, 0.0)).r;",
            "  float downH = texture2D(uPrev, vUv - vec2(0.0, texel.y)).r;",
            "  float upH = texture2D(uPrev, vUv + vec2(0.0, texel.y)).r;",
            "  float prevH = texture2D(uPrev, vUv).g;",
            "  float nextH = (leftH + rightH + downH + upH) * 0.5 - prevH;",
            "  nextH = (nextH - 0.5) * 0.96 + 0.5;",
            "  vec2 delta = vUv - uPointer;",
            "  float hit = exp(-dot(delta, delta) * 420.0) * uImpulse;",
            "  vec2 dripAt = vec2(0.5 + sin(uTime * 0.35) * 0.18, 0.72 + cos(uTime * 0.27) * 0.08);",
            "  vec2 dripDelta = vUv - dripAt;",
            "  float drip = exp(-dot(dripDelta, dripDelta) * 500.0) * 0.006;",
            "  float height = clamp(nextH + hit + drip, 0.02, 0.98);",
            "  gl_FragColor = vec4(height, texture2D(uPrev, vUv).r, 0.0, 1.0);",
            "}"
        ].join("\n")
    });
    const scene = new THREE.Scene();
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material);
    mesh.position.set(0.5, 0.5, 0);
    scene.add(mesh);
    const camera = new THREE.OrthographicCamera(0, 1, 1, 0, 0, 1);
    const display = { value: read.texture };
    const state = { read: read, write: write };
    const bytes = new Uint8Array(size * size * 4);
    for (let i = 0; i < size * size; i += 1) {
        const u = (i % size) / size;
        const v = Math.floor(i / size) / size;
        const h = Math.round((0.5 + Math.sin(u * Math.PI * 6) * Math.sin(v * Math.PI * 5) * 0.02) * 255);
        bytes[i * 4] = h;
        bytes[i * 4 + 1] = h;
        bytes[i * 4 + 2] = 0;
        bytes[i * 4 + 3] = 255;
    }
    const seed = new THREE.DataTexture(bytes, size, size);
    seed.magFilter = THREE.LinearFilter;
    seed.minFilter = THREE.LinearFilter;
    seed.needsUpdate = true;
    let primed = false;
    return {
        size: size,
        texture: display,
        texel: 1 / size,
        update: function (renderer, input) {
            uniforms.uPointer.value.set(input.pointerUv.x, input.pointerUv.y);
            uniforms.uImpulse.value = input.impulse;
            uniforms.uTime.value = input.time;
            uniforms.uPrev.value = primed ? state.read.texture : seed;
            primed = true;
            const previous = renderer.getRenderTarget();
            renderer.setRenderTarget(state.write);
            renderer.render(scene, camera);
            renderer.setRenderTarget(previous);
            display.value = state.write.texture;
            const swap = state.read;
            state.read = state.write;
            state.write = swap;
        },
        dispose: function () {
            material.dispose();
            mesh.geometry.dispose();
            read.dispose();
            write.dispose();
            seed.dispose();
        }
    };
}

function createWebGPUWaves(THREE, size) {
    const tsl = THREE.TSL;
    const data = fillSeed(size);
    const bufferA = new THREE.StorageBufferAttribute(data, 2);
    const bufferB = new THREE.StorageBufferAttribute(data.slice(), 2);
    const src = tsl.storage(bufferA, "vec2", size * size);
    const dst = tsl.storage(bufferB, "vec2", size * size);
    const pointer = tsl.uniform(new THREE.Vector2(0.5, 0.5));
    const impulse = tsl.uniform(0);
    const time = tsl.uniform(0);
    const sizeF = tsl.float(size);
    const limit = size - 1;
    const readAt = function (node, x, y) {
        const cx = tsl.clamp(x, 0, limit);
        const cy = tsl.clamp(y, 0, limit);
        // 1 次元のストレージを格子として読む
        return node.element(tsl.uint(cy.mul(size).add(cx)));
    };
    const step = tsl.Fn(function () {
        const index = tsl.instanceIndex;
        const x = tsl.int(index.mod(tsl.uint(size)));
        const y = tsl.int(index.div(tsl.uint(size)));
        const center = readAt(src, x, y);
        const left = readAt(src, x.sub(1), y);
        const right = readAt(src, x.add(1), y);
        const down = readAt(src, x, y.sub(1));
        const up = readAt(src, x, y.add(1));
        const nextH = left.x.add(right.x).add(down.x).add(up.x).mul(0.5).sub(center.y);
        const damped = nextH.sub(0.5).mul(0.96).add(0.5);
        const u = tsl.float(x).add(0.5).div(sizeF);
        const v = tsl.float(y).add(0.5).div(sizeF);
        const dx = u.sub(pointer.x);
        const dy = v.sub(pointer.y);
        const hit = tsl.exp(dx.mul(dx).add(dy.mul(dy)).mul(-420)).mul(impulse);
        const dripX = tsl.float(0.5).add(tsl.sin(time.mul(0.35)).mul(0.18));
        const dripY = tsl.float(0.72).add(tsl.cos(time.mul(0.27)).mul(0.08));
        const ddx = u.sub(dripX);
        const ddy = v.sub(dripY);
        const drip = tsl.exp(ddx.mul(ddx).add(ddy.mul(ddy)).mul(-500)).mul(0.006);
        const height = tsl.clamp(damped.add(hit).add(drip), 0.02, 0.98);
        dst.element(index).assign(tsl.vec2(height, center.x));
    })().compute(size * size);
    const copy = tsl.Fn(function () {
        src.element(tsl.instanceIndex).assign(dst.element(tsl.instanceIndex));
    })().compute(size * size);
    const sample = function (uv) {
        const p = uv.mul(sizeF.sub(1));
        const x = tsl.int(p.x.floor());
        const y = tsl.int(p.y.floor());
        return readAt(src, x, y).x;
    };
    return {
        size: size,
        sample: sample,
        texel: 1 / size,
        update: function (renderer, input) {
            pointer.value.set(input.pointerUv.x, input.pointerUv.y);
            impulse.value = input.impulse;
            time.value = input.time;
            renderer.compute(step);
            renderer.compute(copy);
        },
        dispose: function () {}
    };
}

export function createWaves(THREE, mode, size) {
    if (mode === "webgpu") {
        try {
            return createWebGPUWaves(THREE, size);
        } catch (error) {
            console.warn("波のコンピュートを作れなかったためシェーダ更新に切り替えます", error);
        }
    }
    return createWebGLWaves(THREE, size);
}
