// 高さ場から屈折の勾配とコースティクスを作る。人物メッシュでは使わない。

export function screenNode(tsl) {
    if (typeof tsl.screenUV === "function") {
        return tsl.screenUV();
    }
    if (tsl.screenUV) {
        return tsl.screenUV;
    }
    return tsl.uv();
}

export function waveGradient(tsl, sample, uv, texel) {
    // 隣の高さの差が、屈折とコースティクスの傾きになる
    const left = sample(uv.sub(tsl.vec2(texel, 0)));
    const right = sample(uv.add(tsl.vec2(texel, 0)));
    const down = sample(uv.sub(tsl.vec2(0, texel)));
    const up = sample(uv.add(tsl.vec2(0, texel)));
    return tsl.vec2(right.sub(left), up.sub(down));
}

export function causticAmount(tsl, sample, uv, texel) {
    const grad = waveGradient(tsl, sample, uv, texel);
    const slope = grad.x.mul(grad.x).add(grad.y.mul(grad.y));
    // 平らな面を明るくし、傾きで筋を切る
    const band = tsl.float(1).sub(tsl.clamp(slope.mul(900), 0, 1));
    const height = sample(uv);
    const ridge = tsl.sin(height.mul(46)).mul(0.5).add(0.5);
    return band.mul(ridge);
}

export const WAVE_GLSL = [
    "uniform sampler2D uWave;",
    "uniform float uWaveTexel;",
    "float waveHeight(vec2 uv) {",
    "  return texture2D(uWave, clamp(uv, vec2(uWaveTexel), vec2(1.0 - uWaveTexel))).r;",
    "}",
    "vec2 waveGradient(vec2 uv) {",
    "  float leftH = waveHeight(uv - vec2(uWaveTexel, 0.0));",
    "  float rightH = waveHeight(uv + vec2(uWaveTexel, 0.0));",
    "  float downH = waveHeight(uv - vec2(0.0, uWaveTexel));",
    "  float upH = waveHeight(uv + vec2(0.0, uWaveTexel));",
    "  return vec2(rightH - leftH, upH - downH);",
    "}",
    "float causticAmount(vec2 uv) {",
    "  vec2 grad = waveGradient(uv);",
    "  float slope = dot(grad, grad);",
    "  float band = 1.0 - clamp(slope * 900.0, 0.0, 1.0);",
    "  float ridge = sin(waveHeight(uv) * 46.0) * 0.5 + 0.5;",
    "  return band * ridge;",
    "}"
].join("\n");
