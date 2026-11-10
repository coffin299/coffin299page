// WebGPU を先に試し、失敗したら WebGL へ落とす。

const WEBGPU_URL = "https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.webgpu.js";
const WEBGL_URL = "https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js";

async function importWebGPU() {
    try {
        // import map があるページは公式のアドオンと同じインスタンスを使う
        return await import("three/webgpu");
    } catch (error) {
        console.warn("import map を使えないため WebGPU ビルドを直接読みます", error);
        return import(WEBGPU_URL);
    }
}

export async function loadRenderer(canvas) {
    if (navigator.gpu) {
        try {
            const THREE = await importWebGPU();
            const renderer = new THREE.WebGPURenderer({ canvas: canvas, antialias: false, alpha: false });
            await renderer.init();
            return { THREE: THREE, renderer: renderer, mode: "webgpu" };
        } catch (error) {
            console.warn("WebGPU を使えなかったため WebGL に切り替えます", error);
        }
    }
    const THREE = await import(WEBGL_URL);
    const renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: false, alpha: false });
    return { THREE: THREE, renderer: renderer, mode: "webgl" };
}

export function makeTarget(THREE, width, height) {
    const options = { depthBuffer: true };
    // WebGPU ビルドは RenderTarget、WebGL ビルドは WebGLRenderTarget
    if (THREE.RenderTarget) {
        return new THREE.RenderTarget(width, height, options);
    }
    return new THREE.WebGLRenderTarget(width, height, options);
}
