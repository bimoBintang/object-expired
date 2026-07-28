/**
 * ONNX Runtime Web Manager (WebGPU + WASM Fallback)
 */

class YOLOModelEngine {
  constructor(modelPath = 'best.onnx') {
    this.modelPath = modelPath;
    this.session = null;
    this.provider = null;
    this.isReady = false;
  }

  async load(onProgress = null) {
    if (typeof ort === 'undefined') {
      throw new Error('ONNX Runtime Web script not loaded. Check CDN link.');
    }

    // Configure WASM asset location (CDN path for .wasm binaries)
    ort.env.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.22.0/dist/';
    // Only enable multithreading when Cross-Origin Isolation is active (requires COOP + COEP headers)
    // Falls back to single-thread automatically when not available (avoids console warnings)
    if (crossOriginIsolated) {
      ort.env.wasm.numThreads = Math.min(4, navigator.hardwareConcurrency || 2);
    } else {
      ort.env.wasm.numThreads = 1;
    }

    const hasWebGPU = !!navigator.gpu;
    const providersToTry = hasWebGPU ? ['webgpu', 'wasm'] : ['wasm'];

    if (onProgress) onProgress({ status: 'Initializing ONNX session...', progress: 20 });

    let lastError = null;

    for (const provider of providersToTry) {
      try {
        console.log(`[ONNX Engine] Attempting to load model with provider: ${provider}`);
        
        if (onProgress) {
          onProgress({ 
            status: `Loading model weights (${provider.toUpperCase()})...`, 
            progress: provider === 'webgpu' ? 40 : 60 
          });
        }

        const sessionOptions = {
          executionProviders: [provider],
          graphOptimizationLevel: 'all'
        };

        this.session = await ort.InferenceSession.create(this.modelPath, sessionOptions);
        this.provider = provider;
        console.log(`[ONNX Engine] Successfully loaded model with provider: ${provider}`);
        break;
      } catch (err) {
        console.warn(`[ONNX Engine] Failed to load with ${provider}:`, err);
        lastError = err;
      }
    }

    if (!this.session) {
      throw new Error(`Failed to load ONNX model on all providers. Details: ${lastError?.message || lastError}`);
    }

    if (onProgress) onProgress({ status: 'Warming up GPU shaders / WASM engine...', progress: 85 });
    await this.warmUp();

    this.isReady = true;
    if (onProgress) onProgress({ status: 'Model ready!', progress: 100 });

    return {
      provider: this.provider,
      inputNames: this.session.inputNames,
      outputNames: this.session.outputNames
    };
  }

  async warmUp() {
    if (!this.session) return;
    try {
      // Create a dummy tensor [1, 3, 640, 640] filled with zeros
      const dummyData = new Float32Array(1 * 3 * 640 * 640);
      const dummyTensor = new ort.Tensor('float32', dummyData, [1, 3, 640, 640]);
      
      const inputName = this.session.inputNames[0] || 'images';
      await this.session.run({ [inputName]: dummyTensor });
      console.log('[ONNX Engine] Warm-up run completed successfully.');
    } catch (e) {
      console.warn('[ONNX Engine] Warm-up warning:', e);
    }
  }

  async predict(imageTensor) {
    if (!this.isReady || !this.session) {
      throw new Error('Engine not ready. Call load() first.');
    }

    const inputName = this.session.inputNames[0] || 'images';
    const outputName = this.session.outputNames[0] || 'output0';

    const feeds = { [inputName]: imageTensor };
    const results = await this.session.run(feeds);

    return results[outputName];
  }
}

// Global instance
window.yoloEngine = new YOLOModelEngine('best.onnx');
