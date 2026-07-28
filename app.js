/**
 * Expired Product Detector — Main Application Controller (Photo & Video Support)
 */

document.addEventListener('DOMContentLoaded', () => {
  // DOM Elements
  const loadingOverlay = document.getElementById('loading-overlay');
  const progressBar = document.getElementById('progress-bar');
  const loadingStatus = document.getElementById('loading-status');
  const headerBackendName = document.getElementById('header-backend-name');

  const btnUpload = document.getElementById('btn-upload');
  const btnWebcam = document.getElementById('btn-webcam');
  const fileInput = document.getElementById('file-input');

  const confSlider = document.getElementById('conf-slider');
  const confValue = document.getElementById('conf-value');

  const stageContainer = document.getElementById('stage-container');
  const dropPlaceholder = document.getElementById('drop-placeholder');
  const canvasWrapper = document.getElementById('canvas-wrapper');
  const mainCanvas = document.getElementById('main-canvas');
  const overlayCanvas = document.getElementById('overlay-canvas');
  const webcamVideo = document.getElementById('webcam-video');
  const uploadedVideo = document.getElementById('uploaded-video');

  const statBackend = document.getElementById('stat-backend');
  const statTime = document.getElementById('stat-time');
  const statCount = document.getElementById('stat-count');
  const statFps = document.getElementById('stat-fps');
  const resultsList = document.getElementById('results-list');

  // Application State
  let confThreshold = parseFloat(confSlider.value);
  let currentImageSource = null; // Last uploaded HTMLImageElement
  let isWebcamActive = false;
  let isUploadedVideoActive = false;
  let webcamStream = null;
  let animationFrameId = null;

  // FPS calculation variables
  let lastFrameTime = performance.now();
  let frameCount = 0;

  // 1. Initialize ONNX Engine
  async function initApp() {
    try {
      const info = await window.yoloEngine.load((progressData) => {
        progressBar.style.width = `${progressData.progress}%`;
        loadingStatus.textContent = progressData.status;
      });

      // Update UI with active backend
      const providerName = info.provider.toUpperCase();
      statBackend.textContent = providerName;
      headerBackendName.textContent = providerName === 'WEBGPU' ? 'WebGPU Accelerated' : 'WASM (CPU)';
      
      if (providerName === 'WEBGPU') {
        statBackend.className = 'stat-value highlight';
      } else {
        statBackend.className = 'stat-value warning';
      }

      // Hide loading overlay
      setTimeout(() => {
        loadingOverlay.classList.add('hidden');
      }, 400);

    } catch (err) {
      console.error('Initialization error:', err);
      loadingStatus.textContent = `Error: ${err.message}`;
      loadingStatus.style.color = '#f43f5e';
    }
  }

  initApp();

  // Helper: Stop all active media playback & loops
  function stopAllActiveMedia() {
    // Stop webcam
    isWebcamActive = false;
    if (webcamStream) {
      webcamStream.getTracks().forEach(track => track.stop());
      webcamStream = null;
    }
    webcamVideo.pause();
    webcamVideo.srcObject = null;

    // Reset webcam button
    btnWebcam.innerHTML = `
      <svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg>
      Live Kamera
    `;
    btnWebcam.className = 'btn btn-secondary';

    // Stop uploaded video
    isUploadedVideoActive = false;
    uploadedVideo.pause();
    if (uploadedVideo.src) {
      URL.revokeObjectURL(uploadedVideo.src);
      uploadedVideo.src = '';
    }

    // Cancel animation loop
    if (animationFrameId) {
      cancelAnimationFrame(animationFrameId);
      animationFrameId = null;
    }

    statFps.textContent = '—';
  }

  // 2. Confidence Slider Handler
  confSlider.addEventListener('input', (e) => {
    confThreshold = parseFloat(e.target.value);
    confValue.textContent = `${Math.round(confThreshold * 100)}%`;

    // Re-run detection on current static image if active
    if (currentImageSource && !isWebcamActive && !isUploadedVideoActive) {
      runSingleDetection(currentImageSource);
    }
  });

  // 3. Upload Buttons & Input Handlers
  btnUpload.addEventListener('click', () => {
    fileInput.click();
  });

  fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
      loadMediaFromFile(file);
    }
  });

  // 4. Drag and Drop Handlers
  stageContainer.addEventListener('dragover', (e) => {
    e.preventDefault();
    stageContainer.classList.add('drag-over');
  });

  stageContainer.addEventListener('dragleave', () => {
    stageContainer.classList.remove('drag-over');
  });

  stageContainer.addEventListener('drop', (e) => {
    e.preventDefault();
    stageContainer.classList.remove('drag-over');

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      loadMediaFromFile(e.dataTransfer.files[0]);
    }
  });

  function loadMediaFromFile(file) {
    stopAllActiveMedia();

    if (file.type.startsWith('video/')) {
      // Process Video File
      currentImageSource = null;
      const videoURL = URL.createObjectURL(file);
      uploadedVideo.src = videoURL;
      uploadedVideo.load();
      
      uploadedVideo.onloadedmetadata = () => {
        dropPlaceholder.style.display = 'none';
        canvasWrapper.classList.add('active');
        isUploadedVideoActive = true;
        uploadedVideo.play();
        
        frameCount = 0;
        lastFrameTime = performance.now();
        runVideoFrameLoop(uploadedVideo, () => isUploadedVideoActive);
      };
    } else if (file.type.startsWith('image/')) {
      // Process Image File
      const reader = new FileReader();
      reader.onload = (evt) => {
        const img = new Image();
        img.onload = () => {
          currentImageSource = img;
          runSingleDetection(img);
        };
        img.src = evt.target.result;
      };
      reader.readAsDataURL(file);
    } else {
      alert('Format file tidak didukung. Harap upload gambar (JPG, PNG, WebP) atau video (MP4, WebM, MOV).');
    }
  }

  // 5. Single Image Detection Workflow
  async function runSingleDetection(imgSource) {
    if (!window.yoloEngine.isReady) return;

    // Show canvas, hide drop placeholder
    dropPlaceholder.style.display = 'none';
    canvasWrapper.classList.add('active');

    // Draw main image on main canvas
    const origW = imgSource.naturalWidth || imgSource.width;
    const origH = imgSource.naturalHeight || imgSource.height;

    mainCanvas.width = origW;
    mainCanvas.height = origH;
    const ctx = mainCanvas.getContext('2d');
    ctx.drawImage(imgSource, 0, 0, origW, origH);

    // Preprocessing (Letterbox 640x640 + Tensor)
    const letterboxInfo = letterboxResize(imgSource, 640, 640);
    const tensor = preprocessToTensor(letterboxInfo.canvas);

    // Run Inference & Measure Time
    const startTime = performance.now();
    const outputTensor = await window.yoloEngine.predict(tensor);
    const inferenceTimeMs = (performance.now() - startTime).toFixed(1);

    // Postprocessing
    const detections = postProcessOutput(outputTensor, confThreshold, letterboxInfo);

    // Render Overlay Canvas
    drawDetections(overlayCanvas, detections, origW, origH);

    // Update Stats
    statTime.textContent = `${inferenceTimeMs} ms`;
    statCount.textContent = detections.length;
    statFps.textContent = '—';

    // Update Detections List
    renderDetectionsList(detections);
  }

  // 6. Live Webcam Handler
  btnWebcam.addEventListener('click', () => {
    if (isWebcamActive) {
      stopAllActiveMedia();
    } else {
      startWebcam();
    }
  });

  async function startWebcam() {
    stopAllActiveMedia();
    try {
      webcamStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'environment',
          width: { ideal: 1280 },
          height: { ideal: 720 }
        },
        audio: false
      });

      webcamVideo.srcObject = webcamStream;
      await webcamVideo.play();

      isWebcamActive = true;
      btnWebcam.innerHTML = `
        <svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M6 18L18 6M6 6l12 12"/></svg>
        Hentikan Kamera
      `;
      btnWebcam.className = 'btn btn-danger';

      dropPlaceholder.style.display = 'none';
      canvasWrapper.classList.add('active');

      frameCount = 0;
      lastFrameTime = performance.now();

      runVideoFrameLoop(webcamVideo, () => isWebcamActive);
    } catch (err) {
      alert(`Gagal membuka kamera: ${err.message}`);
      stopAllActiveMedia();
    }
  }

  // 7. Generic Video Frame Processing Loop (Webcam & Uploaded Video)
  async function runVideoFrameLoop(videoElement, isActiveCheck) {
    if (!isActiveCheck() || videoElement.paused || videoElement.ended) {
      if (isActiveCheck()) {
        animationFrameId = requestAnimationFrame(() => runVideoFrameLoop(videoElement, isActiveCheck));
      }
      return;
    }

    const vidW = videoElement.videoWidth;
    const vidH = videoElement.videoHeight;

    if (vidW > 0 && vidH > 0) {
      // Draw frame onto main canvas
      mainCanvas.width = vidW;
      mainCanvas.height = vidH;
      const ctx = mainCanvas.getContext('2d');
      ctx.drawImage(videoElement, 0, 0, vidW, vidH);

      // Preprocessing
      const letterboxInfo = letterboxResize(videoElement, 640, 640);
      const tensor = preprocessToTensor(letterboxInfo.canvas);

      // Inference
      const startTime = performance.now();
      const outputTensor = await window.yoloEngine.predict(tensor);
      const inferenceTimeMs = (performance.now() - startTime).toFixed(1);

      // Postprocessing
      const detections = postProcessOutput(outputTensor, confThreshold, letterboxInfo);

      // Render overlay
      drawDetections(overlayCanvas, detections, vidW, vidH);

      // Calculate FPS
      frameCount++;
      const now = performance.now();
      const delta = now - lastFrameTime;
      if (delta >= 1000) {
        const currentFps = Math.round((frameCount * 1000) / delta);
        frameCount = 0;
        lastFrameTime = now;
        statFps.textContent = `${currentFps} FPS`;
      }

      // Update stats
      statTime.textContent = `${inferenceTimeMs} ms`;
      statCount.textContent = detections.length;
      renderDetectionsList(detections);
    }

    animationFrameId = requestAnimationFrame(() => runVideoFrameLoop(videoElement, isActiveCheck));
  }

  // 8. Render Detections List Pills
  function renderDetectionsList(detections) {
    resultsList.innerHTML = '';

    if (detections.length === 0) {
      resultsList.innerHTML = '<span class="no-detections">Tidak ditemukan produk kedaluwarsa pada ambang batas ini.</span>';
      return;
    }

    detections.forEach((det, idx) => {
      const pill = document.createElement('div');
      pill.className = 'detection-pill';
      
      const confStr = (det.confidence * 100).toFixed(1);
      pill.innerHTML = `
        <span>#${idx + 1} <strong>${det.className}</strong></span>
        <span class="detection-pill-conf">${confStr}%</span>
      `;
      resultsList.appendChild(pill);
    });
  }

});
