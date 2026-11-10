// 泡、塵、プランクトン、魚群。WebGPU はコンピュート、WebGL は CPU。

import { causticAmount, WAVE_GLSL } from "./refraction.js";

function fishCanvas() {
    const canvas = document.createElement("canvas");
    canvas.width = 160;
    canvas.height = 80;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#ffffff";
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

function softCanvas() {
    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext("2d");
    const glow = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
    glow.addColorStop(0, "rgba(255,255,255,0.9)");
    glow.addColorStop(0.45, "rgba(190,235,255,0.35)");
    glow.addColorStop(1, "rgba(190,235,255,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, 64, 64);
    return canvas;
}

function makeTexture(THREE, canvas) {
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
}

function hashUnit(index) {
    const value = Math.sin(index * 127.1 + 311.7) * 43758.5453;
    return value - Math.floor(value);
}

function createFish(index, aspect) {
    const slot = hashUnit(index) * Math.PI * 2;
    const spread = 0.2 + hashUnit(index + 4) * 0.35;
    return {
        x: (hashUnit(index + 1) - 0.5) * aspect * 2,
        y: (hashUnit(index + 2) - 0.5) * 1.6,
        vx: Math.cos(slot) * 0.05,
        vy: Math.sin(slot) * 0.04,
        heading: slot,
        slot: slot,
        spread: spread,
        offsetX: Math.cos(slot) * spread,
        offsetY: Math.sin(slot) * spread * 0.72,
        maxSpeed: 0.26 + hashUnit(index + 3) * 0.1,
        scale: 0.85 + hashUnit(index + 5) * 0.25
    };
}

function stepFish(fish, group, dt, input) {
    let sepX = 0;
    let sepY = 0;
    let aliX = 0;
    let aliY = 0;
    let cohX = 0;
    let cohY = 0;
    let near = 0;
    group.forEach(function (other) {
        if (other === fish) {
            return;
        }
        const dx = fish.x - other.x;
        const dy = fish.y - other.y;
        const dist = Math.hypot(dx, dy) || 0.0001;
        if (dist < 0.22) {
            sepX += dx / dist;
            sepY += dy / dist;
        }
        if (dist < 0.7) {
            aliX += other.vx;
            aliY += other.vy;
            cohX += other.x;
            cohY += other.y;
            near += 1;
        }
    });
    if (near > 0) {
        aliX /= near;
        aliY /= near;
        cohX = cohX / near - fish.x;
        cohY = cohY / near - fish.y;
    }
    const sway = Math.sin(input.time * 1.6 + fish.slot) * 0.05;
    const homeX = input.idle ? Math.cos(input.time * 0.12 + fish.slot) * 0.55 : input.pointer.x;
    const homeY = input.idle ? Math.sin(input.time * 0.1 + fish.slot) * 0.32 : input.pointer.y;
    const goalX = homeX + fish.offsetX + Math.cos(fish.slot) * sway;
    const goalY = homeY + fish.offsetY;
    let desiredX = goalX - fish.x;
    let desiredY = goalY - fish.y;
    const distance = Math.hypot(desiredX, desiredY) || 0.0001;
    const cruise = fish.maxSpeed * Math.min(1, distance / 0.35);
    desiredX = (desiredX / distance) * cruise + sepX * 0.32 + aliX * 0.08 + cohX * 0.05;
    desiredY = (desiredY / distance) * cruise + sepY * 0.32 + aliY * 0.08 + cohY * 0.05;
    fish.vx += (desiredX - fish.vx) * Math.min(1, dt * 1.15);
    fish.vy += (desiredY - fish.vy) * Math.min(1, dt * 1.15);
    const speed = Math.hypot(fish.vx, fish.vy) || 0.0001;
    if (speed > fish.maxSpeed) {
        fish.vx = (fish.vx / speed) * fish.maxSpeed;
        fish.vy = (fish.vy / speed) * fish.maxSpeed;
    }
    fish.x += fish.vx * dt;
    fish.y += fish.vy * dt;
    if (Math.abs(fish.x) > input.aspect + 0.2) {
        fish.vx -= Math.sign(fish.x) * dt * 0.15;
    }
    if (Math.abs(fish.y) > 1.05) {
        fish.vy -= Math.sign(fish.y) * dt * 0.15;
    }
    const aim = Math.atan2(fish.vy, fish.vx);
    let turn = aim - fish.heading;
    if (turn > Math.PI) {
        turn -= Math.PI * 2;
    }
    if (turn < -Math.PI) {
        turn += Math.PI * 2;
    }
    const maxTurn = 1.15 * dt;
    fish.heading += Math.max(-maxTurn, Math.min(maxTurn, turn));
}

function stepDrift(item, dt, input, rise) {
    item.x += item.vx * dt;
    item.y += item.vy * dt;
    if (rise) {
        item.y += item.speed * dt;
    }
    const dx = item.x - input.pointer.x;
    const dy = item.y - input.pointer.y;
    const dist = Math.hypot(dx, dy) || 0.0001;
    if (dist < 0.38 && input.impulse > 0.001) {
        // 波紋の近くでは泡と粒子を押し出す
        item.vx += (dx / dist) * (0.38 - dist) * input.impulse * 3.2;
        item.vy += input.impulse * 0.25;
    }
    item.vx *= Math.max(0, 1 - dt * 0.6);
    item.vy *= Math.max(0, 1 - dt * 0.6);
    if (item.y > 1.25) {
        item.y = -1.2;
        item.x = (Math.random() - 0.5) * input.aspect * 2;
    }
    if (Math.abs(item.x) > input.aspect + 0.4) {
        item.x = -Math.sign(item.x) * input.aspect;
    }
}

function createCpuSchool(THREE, fishTexture, scene, count, z, aspect, tint) {
    const group = [];
    const meshes = [];
    for (let index = 0; index < count; index += 1) {
        const fish = createFish(index, aspect);
        const material = new THREE.MeshBasicMaterial({
            map: fishTexture,
            color: tint,
            transparent: true,
            alphaTest: 0.15,
            depthWrite: true,
            toneMapped: false
        });
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.09, 0.038), material);
        mesh.scale.setScalar(fish.scale);
        mesh.position.set(fish.x, fish.y, z);
        mesh.frustumCulled = false;
        scene.add(mesh);
        group.push(fish);
        meshes.push(mesh);
    }
    return {
        update: function (dt, input) {
            group.forEach(function (fish, index) {
                stepFish(fish, group, dt, input);
                meshes[index].position.x = fish.x;
                meshes[index].position.y = fish.y;
                meshes[index].rotation.z = fish.heading;
            });
        },
        dispose: function () {
            meshes.forEach(function (mesh) {
                mesh.geometry.dispose();
                mesh.material.dispose();
            });
        }
    };
}

function createCpuPoints(THREE, texture, scene, count, z, aspect, options) {
    const items = [];
    const positions = new Float32Array(count * 3);
    for (let index = 0; index < count; index += 1) {
        const item = {
            x: (hashUnit(index + 9) - 0.5) * aspect * 2,
            y: (hashUnit(index + 10) - 0.5) * 2,
            vx: 0,
            vy: 0,
            speed: options.speed + hashUnit(index + 11) * options.speedJitter,
            phase: hashUnit(index + 12) * Math.PI * 2
        };
        items.push(item);
        positions[index * 3] = item.x;
        positions[index * 3 + 1] = item.y;
        positions[index * 3 + 2] = 0;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    let material = null;
    if (options.refract && options.library) {
        // 泡の円の中だけ、背景を法線方向へずらして屈折させる
        material = new THREE.ShaderMaterial({
            uniforms: {
                uScene: { value: options.library.texture },
                uResolution: { value: new THREE.Vector2(1, 1) },
                uWave: { value: options.waves && options.waves.texture ? options.waves.texture.value : null },
                uWaveTexel: { value: options.waves ? options.waves.texel : 0.01 },
                uSize: { value: options.size }
            },
            transparent: true,
            depthWrite: false,
            toneMapped: false,
            vertexShader: [
                "uniform float uSize;",
                "void main() {",
                "  vec4 mv = modelViewMatrix * vec4(position, 1.0);",
                "  gl_Position = projectionMatrix * mv;",
                "  gl_PointSize = uSize * 900.0;",
                "}"
            ].join("\n"),
            fragmentShader: [
                "precision highp float;",
                "uniform sampler2D uScene;",
                "uniform vec2 uResolution;",
                WAVE_GLSL,
                "void main() {",
                "  vec2 n = gl_PointCoord - 0.5;",
                "  if (dot(n, n) > 0.25) discard;",
                "  vec2 screenUv = gl_FragCoord.xy / uResolution;",
                "  vec3 sceneColor = texture2D(uScene, screenUv + n * 0.04).rgb;",
                "  float light = causticAmount(screenUv);",
                "  float rim = smoothstep(0.5, 0.28, length(n));",
                "  vec3 color = sceneColor * 0.72 + vec3(0.75, 0.93, 1.0) * rim * 0.35;",
                "  gl_FragColor = vec4(color * (light * 0.35 + 0.8), 0.9);",
                "}"
            ].join("\n")
        });
    } else {
        material = new THREE.PointsMaterial({
            map: texture,
            color: options.color,
            transparent: true,
            depthWrite: false,
            size: options.size,
            sizeAttenuation: true,
            blending: options.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
            opacity: options.opacity,
            toneMapped: false
        });
    }
    const points = new THREE.Points(geometry, material);
    points.position.z = z;
    points.frustumCulled = false;
    scene.add(points);
    return {
        snapshot: Boolean(options.refract),
        object: points,
        update: function (dt, input) {
            items.forEach(function (item, index) {
                if (!options.rise) {
                    item.vx += Math.sin(input.time * 0.4 + item.phase) * dt * 0.02;
                    item.vy += Math.cos(input.time * 0.3 + item.phase) * dt * 0.015;
                }
                stepDrift(item, dt, input, options.rise);
                positions[index * 3] = item.x;
                positions[index * 3 + 1] = item.y;
            });
            geometry.attributes.position.needsUpdate = true;
            if (material.uniforms && material.uniforms.uResolution) {
                material.uniforms.uResolution.value.set(input.width, input.height);
                if (options.waves && options.waves.texture) {
                    material.uniforms.uWave.value = options.waves.texture.value;
                }
            }
            if (options.pulse && material.opacity !== undefined && !material.uniforms) {
                material.opacity = options.opacity * (0.65 + Math.sin(input.time * 1.4) * 0.35);
            }
        },
        dispose: function () {
            geometry.dispose();
            material.dispose();
        }
    };
}

function placeSprite(THREE, material, count, scene) {
    const sprite = new THREE.Sprite(material);
    // count が描画インスタンス数になる。平面を引き伸ばさない
    sprite.count = count;
    sprite.frustumCulled = false;
    sprite.center.set(0.5, 0.5);
    scene.add(sprite);
    return sprite;
}

function gpuSchool(THREE, texture, scene, count, z, aspect, tint, waves) {
    const tsl = THREE.TSL;
    // 公式のコンピュート粒子と同じく、位置は instancedArray にして toAttribute で読む
    const positions = tsl.instancedArray(count, "vec3");
    const headings = tsl.instancedArray(count, "float");
    const info = tsl.instancedArray(count, "vec4");
    const pointer = tsl.uniform(new THREE.Vector2());
    const aspectU = tsl.uniform(aspect);
    const dtU = tsl.uniform(0.016);
    const timeU = tsl.uniform(0);
    const idleU = tsl.uniform(1);
    const init = tsl.Fn(function () {
        const index = tsl.instanceIndex;
        const slot = tsl.hash(index).mul(Math.PI * 2);
        const spread = tsl.float(0.2).add(tsl.hash(index.add(4)).mul(0.35));
        const x = tsl.hash(index.add(1)).sub(0.5).mul(aspectU).mul(2);
        const y = tsl.hash(index.add(2)).sub(0.5).mul(1.6);
        positions.element(index).assign(tsl.vec3(x, y, z));
        headings.element(index).assign(slot);
        info.element(index).assign(tsl.vec4(
            tsl.cos(slot).mul(spread),
            tsl.sin(slot).mul(spread).mul(0.72),
            slot,
            tsl.float(0.26).add(tsl.hash(index.add(3)).mul(0.1))
        ));
    })().compute(count);
    const step = tsl.Fn(function () {
        const index = tsl.instanceIndex;
        const self = positions.element(index);
        const meta = info.element(index);
        const origin = tsl.vec3(self.x, self.y, self.z).toVar();
        const sep = tsl.vec2(0, 0).toVar();
        tsl.Loop(count, function ({ i }) {
            const other = positions.element(i);
            const delta = origin.xy.sub(other.xy);
            const dist = tsl.length(delta).max(0.0001);
            // 近い個体だけ離す。自分自身の差は 0 なので寄与しない
            const close = tsl.float(1).sub(tsl.smoothstep(tsl.float(0), tsl.float(0.22), dist));
            sep.addAssign(delta.div(dist).mul(close));
        });
        const home = tsl.mix(
            pointer,
            tsl.vec2(tsl.cos(timeU.mul(0.12).add(meta.z)).mul(0.55), tsl.sin(timeU.mul(0.1).add(meta.z)).mul(0.32)),
            idleU
        );
        const sway = tsl.sin(timeU.mul(1.6).add(meta.z)).mul(0.05);
        const goal = home.add(meta.xy).add(tsl.vec2(tsl.cos(meta.z).mul(sway), 0));
        const desired = goal.sub(origin.xy);
        const distance = tsl.length(desired).max(0.0001);
        const cruise = meta.w.mul(tsl.min(tsl.float(1), distance.div(0.35)));
        const steer = desired.div(distance).mul(cruise).add(sep.mul(0.32));
        const speed = tsl.length(steer).max(0.0001);
        const limited = steer.mul(tsl.min(tsl.float(1), meta.w.div(speed)));
        const nextX = tsl.clamp(origin.x.add(limited.x.mul(dtU)), aspectU.negate().sub(0.25), aspectU.add(0.25));
        const nextY = tsl.clamp(origin.y.add(limited.y.mul(dtU)), -1.15, 1.15);
        self.assign(tsl.vec3(nextX, nextY, origin.z));
        const aim = tsl.atan2(limited.y, limited.x);
        const prev = headings.element(index);
        const twoPi = tsl.float(Math.PI * 2);
        let turn = aim.sub(prev);
        turn = turn.sub(twoPi.mul(tsl.floor(turn.add(Math.PI).div(twoPi))));
        const maxTurn = dtU.mul(1.15);
        headings.element(index).assign(prev.add(tsl.clamp(turn, maxTurn.negate(), maxTurn)));
    })().compute(count);
    const material = new THREE.SpriteNodeMaterial();
    material.positionNode = positions.toAttribute();
    material.rotationNode = headings.toAttribute();
    material.scaleNode = tsl.vec2(0.12, 0.05).mul(tsl.float(0.85).add(tsl.hash(tsl.instanceIndex).mul(0.3)));
    material.sizeAttenuation = false;
    const sampled = tsl.texture(texture);
    let color = sampled.rgb.mul(tsl.vec3(tint[0], tint[1], tint[2]));
    if (waves.sample) {
        const light = causticAmount(tsl, waves.sample, tsl.uv(), waves.texel);
        color = color.mul(light.mul(0.35).add(0.8));
    }
    material.colorNode = color;
    material.opacityNode = sampled.a;
    material.transparent = true;
    material.alphaTest = 0.15;
    material.depthWrite = false;
    material.toneMapped = false;
    const mesh = placeSprite(THREE, material, count, scene);
    let primed = false;
    return {
        object: mesh,
        update: function (renderer, dt, input) {
            pointer.value.set(input.pointer.x, input.pointer.y);
            aspectU.value = input.aspect;
            dtU.value = dt;
            timeU.value = input.time;
            idleU.value = input.idle ? 1 : 0;
            if (!primed) {
                renderer.compute(init);
                primed = true;
            }
            renderer.compute(step);
        },
        copy: function () {},
        dispose: function () {
            material.dispose();
        }
    };
}

function gpuDrift(THREE, texture, scene, count, z, aspect, options, waves) {
    const tsl = THREE.TSL;
    const positions = tsl.instancedArray(count, "vec3");
    const speed = tsl.instancedArray(count, "float");
    const pointer = tsl.uniform(new THREE.Vector2());
    const aspectU = tsl.uniform(aspect);
    const dtU = tsl.uniform(0.016);
    const timeU = tsl.uniform(0);
    const impulseU = tsl.uniform(0);
    const init = tsl.Fn(function () {
        const index = tsl.instanceIndex;
        const x = tsl.hash(index.add(2)).sub(0.5).mul(aspectU).mul(2);
        const y = tsl.hash(index.add(3)).sub(0.5).mul(2);
        positions.element(index).assign(tsl.vec3(x, y, z));
        const base = options.rise ? 0.045 : 0.012;
        speed.element(index).assign(tsl.float(base).add(tsl.hash(index.add(4)).mul(options.speedJitter)));
    })().compute(count);
    const step = tsl.Fn(function () {
        const index = tsl.instanceIndex;
        const self = positions.element(index);
        const phase = tsl.float(index).mul(0.17);
        const rise = tsl.float(options.rise ? 1 : 0);
        let vx = tsl.sin(timeU.mul(0.4).add(phase)).mul(options.rise ? 0.01 : 0.035);
        let vy = rise.mul(speed.element(index));
        vy = vy.add(tsl.cos(timeU.mul(0.3).add(phase)).mul(options.rise ? 0 : 0.02));
        const delta = self.xy.sub(pointer);
        const dist = tsl.length(delta).max(0.0001);
        const push = tsl.float(1).sub(tsl.smoothstep(tsl.float(0), tsl.float(0.38), dist)).mul(impulseU);
        vx = vx.add(delta.x.div(dist).mul(push).mul(3.2));
        vy = vy.add(push.mul(0.25));
        const nextX = self.x.add(vx.mul(dtU));
        const nextY = self.y.add(vy.mul(dtU));
        const wrapped = nextY.greaterThan(1.25);
        const resetX = tsl.fract(tsl.sin(tsl.float(index).mul(12.9898).add(timeU)).mul(43758.5453)).sub(0.5).mul(aspectU).mul(2);
        const finalY = wrapped.select(tsl.float(-1.15), nextY);
        const finalX = wrapped.select(resetX, nextX);
        const side = finalX.abs().greaterThan(aspectU.add(0.35));
        self.assign(tsl.vec3(side.select(finalX.negate(), finalX), finalY, self.z));
    })().compute(count);
    const material = new THREE.SpriteNodeMaterial();
    material.positionNode = positions.toAttribute();
    material.scaleNode = tsl.vec2(options.size, options.size);
    material.sizeAttenuation = false;
    if (options.refract && options.library) {
        const n = tsl.uv().sub(0.5);
        const screen = typeof tsl.screenUV === "function" ? tsl.screenUV() : tsl.uv();
        // 図書館を先に描いたテクスチャを法線分だけずらして泡の屈折にする
        const sampled = tsl.texture(options.library.texture, screen.add(n.mul(0.035)));
        const rim = tsl.smoothstep(tsl.float(0.5), tsl.float(0.28), tsl.length(n));
        let color = sampled.rgb.mul(0.72).add(tsl.vec3(0.75, 0.93, 1).mul(rim.mul(0.35)));
        if (waves.sample) {
            const light = causticAmount(tsl, waves.sample, screen, waves.texel);
            color = color.mul(light.mul(0.35).add(0.8));
        }
        material.colorNode = color;
        material.opacityNode = tsl.smoothstep(tsl.float(0.52), tsl.float(0.2), tsl.length(n)).mul(0.9);
    } else {
        const sampled = tsl.texture(texture);
        const pulse = options.pulse ? tsl.sin(timeU.mul(1.4).add(tsl.float(tsl.instanceIndex).mul(0.2))).mul(0.35).add(0.7) : tsl.float(1);
        let color = sampled.rgb.mul(tsl.vec3(options.tint[0], options.tint[1], options.tint[2]));
        if (waves.sample && options.caustic) {
            const screen = typeof tsl.screenUV === "function" ? tsl.screenUV() : tsl.uv();
            const light = causticAmount(tsl, waves.sample, screen, waves.texel);
            color = color.mul(light.mul(0.4).add(0.75));
        }
        material.colorNode = color;
        material.opacityNode = sampled.a.mul(pulse).mul(options.opacity);
    }
    material.transparent = true;
    material.depthWrite = false;
    material.toneMapped = false;
    if (options.additive) {
        material.blending = THREE.AdditiveBlending;
    }
    const mesh = placeSprite(THREE, material, count, scene);
    let primed = false;
    return {
        snapshot: Boolean(options.refract),
        object: mesh,
        update: function (renderer, dt, input) {
            pointer.value.set(input.pointer.x, input.pointer.y);
            aspectU.value = input.aspect;
            dtU.value = dt;
            timeU.value = input.time;
            impulseU.value = input.impulse;
            if (!primed) {
                renderer.compute(init);
                primed = true;
            }
            renderer.compute(step);
        },
        copy: function () {},
        dispose: function () {
            material.dispose();
        }
    };
}

export function createParticles(THREE, mode, settings, waves, libraryTarget, worldScene, frontScene) {
    const fishTexture = makeTexture(THREE, fishCanvas());
    const soft = makeTexture(THREE, softCanvas());
    const frontFish = Math.max(2, Math.round(settings.fish * 0.34));
    const backFish = Math.max(1, settings.fish - frontFish);
    const frontBubble = Math.max(4, Math.round(settings.bubble * 0.2));
    const backBubble = Math.max(1, settings.bubble - frontBubble);
    const systems = [];
    const useGpu = mode === "webgpu";
    if (useGpu) {
        try {
            systems.push(gpuSchool(THREE, fishTexture, worldScene, backFish, 0.46, 1.6, [0.95, 0.82, 0.36], waves));
            systems.push(gpuSchool(THREE, fishTexture, frontScene, frontFish, 0.92, 1.6, [0.9, 0.97, 1], waves));
            systems.push(gpuDrift(THREE, soft, worldScene, backBubble, 0.4, 1.6, {
                rise: true,
                speedJitter: 0.05,
                size: 0.055,
                refract: true,
                library: libraryTarget,
                caustic: true
            }, waves));
            systems.push(gpuDrift(THREE, soft, frontScene, frontBubble, 0.96, 1.6, {
                rise: true,
                speedJitter: 0.05,
                size: 0.07,
                refract: true,
                library: libraryTarget,
                caustic: true
            }, waves));
            systems.push(gpuDrift(THREE, soft, worldScene, settings.dust, 0.36, 1.6, {
                rise: false,
                speedJitter: 0.02,
                size: 0.028,
                opacity: 0.45,
                tint: [0.75, 0.88, 0.95],
                caustic: true
            }, waves));
            systems.push(gpuDrift(THREE, soft, worldScene, settings.plankton, 0.5, 1.6, {
                rise: false,
                speedJitter: 0.02,
                size: 0.02,
                opacity: 0.85,
                tint: [0.55, 1, 0.95],
                pulse: true,
                additive: true,
                caustic: false
            }, waves));
            return {
                gpu: true,
                setSnapshot: function (hidden) {
                    systems.forEach(function (system) {
                        if (system.snapshot && system.object) {
                            system.object.visible = !hidden;
                        }
                    });
                },
                update: function (renderer, dt, input) {
                    systems.forEach(function (system) {
                        system.update(renderer, dt, input);
                    });
                    systems.forEach(function (system) {
                        if (system.copy) {
                            system.copy(renderer);
                        }
                    });
                },
                dispose: function () {
                    systems.forEach(function (system) {
                        system.dispose();
                    });
                    fishTexture.dispose();
                    soft.dispose();
                }
            };
        } catch (error) {
            console.warn("パーティクルのコンピュートを作れなかったため CPU に切り替えます", error);
            systems.forEach(function (system) {
                system.dispose();
            });
            systems.length = 0;
        }
    }
    const gold = new THREE.Color("#f2d15c");
    const silver = new THREE.Color("#e7f7ff");
    const cpu = [
        createCpuSchool(THREE, fishTexture, worldScene, backFish, 0.46, 1.6, gold),
        createCpuSchool(THREE, fishTexture, frontScene, frontFish, 0.92, 1.6, silver),
        createCpuPoints(THREE, soft, worldScene, backBubble, 0.4, 1.6, {
            rise: true,
            speed: 0.05,
            speedJitter: 0.05,
            size: 0.045,
            color: 0xd8f4ff,
            opacity: 0.85,
            refract: true,
            library: libraryTarget,
            waves: waves
        }),
        createCpuPoints(THREE, soft, frontScene, frontBubble, 0.96, 1.6, {
            rise: true,
            speed: 0.05,
            speedJitter: 0.05,
            size: 0.055,
            color: 0xd8f4ff,
            opacity: 0.9,
            refract: true,
            library: libraryTarget,
            waves: waves
        }),
        createCpuPoints(THREE, soft, worldScene, settings.dust, 0.36, 1.6, {
            rise: false,
            speed: 0.01,
            speedJitter: 0.02,
            size: 0.02,
            color: 0xb7d7e4,
            opacity: 0.45
        }),
        createCpuPoints(THREE, soft, worldScene, settings.plankton, 0.5, 1.6, {
            rise: false,
            speed: 0.012,
            speedJitter: 0.02,
            size: 0.018,
            color: 0x9ffff0,
            opacity: 0.8,
            pulse: true,
            additive: true
        })
    ];
    return {
        gpu: false,
        setSnapshot: function (hidden) {
            cpu.forEach(function (system) {
                if (system.snapshot && system.object) {
                    system.object.visible = !hidden;
                }
            });
        },
        update: function (renderer, dt, input) {
            cpu.forEach(function (system) {
                system.update(dt, input);
            });
        },
        dispose: function () {
            cpu.forEach(function (system) {
                system.dispose();
            });
            fishTexture.dispose();
            soft.dispose();
        }
    };
}

export { WAVE_GLSL };
