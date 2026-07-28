/**
 * Utilities for Image Preprocessing, YOLO Tensor Format, Postprocessing, and Canvas Rendering
 */

const CLASS_NAMES = {
  0: 'detection-expired'
};

/**
 * Perform letterbox resize of an image onto a 640x640 canvas context
 * Returns canvas, scale factor, and padding offsets (dx, dy)
 */
function letterboxResize(imageSource, targetWidth = 640, targetHeight = 640) {
  const origWidth = imageSource.naturalWidth || imageSource.videoWidth || imageSource.width;
  const origHeight = imageSource.naturalHeight || imageSource.videoHeight || imageSource.height;

  // Calculate scale factor (keep aspect ratio)
  const scale = Math.min(targetWidth / origWidth, targetHeight / origHeight);
  const newUnpadW = Math.round(origWidth * scale);
  const newUnpadH = Math.round(origHeight * scale);

  // Padding offsets
  const dx = (targetWidth - newUnpadW) / 2;
  const dy = (targetHeight - newUnpadH) / 2;

  // Offscreen canvas for 640x640 letterbox image
  const offscreen = document.createElement('canvas');
  offscreen.width = targetWidth;
  offscreen.height = targetHeight;
  const ctx = offscreen.getContext('2d');

  // Fill background with neutral gray (114, 114, 114) typical for YOLO letterboxing
  ctx.fillStyle = 'rgb(114, 114, 114)';
  ctx.fillRect(0, 0, targetWidth, targetHeight);

  // Draw scaled image centered
  ctx.drawImage(imageSource, dx, dy, newUnpadW, newUnpadH);

  return {
    canvas: offscreen,
    scale,
    dx,
    dy,
    origWidth,
    origHeight
  };
}

/**
 * Preprocess letterboxed canvas into an ONNX Float32 Tensor [1, 3, 640, 640]
 */
function preprocessToTensor(letterboxCanvas) {
  const ctx = letterboxCanvas.getContext('2d');
  const width = letterboxCanvas.width;
  const height = letterboxCanvas.height;
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data; // RGBA uint8 array

  // Allocate Float32Array for 1x3x640x640 CHW
  const floatData = new Float32Array(1 * 3 * width * height);

  const channelLength = width * height;
  for (let i = 0; i < channelLength; i++) {
    const r = data[i * 4];
    const g = data[i * 4 + 1];
    const b = data[i * 4 + 2];

    // CHW layout normalized to 0.0 - 1.0
    floatData[i] = r / 255.0;                      // R
    floatData[channelLength + i] = g / 255.0;     // G
    floatData[channelLength * 2 + i] = b / 255.0; // B
  }

  return new ort.Tensor('float32', floatData, [1, 3, width, height]);
}

/**
 * Post-process YOLO26 end2end tensor output [1, 300, 6]
 * Tensor values per detection: [x1, y1, x2, y2, confidence, class_id]
 */
function postProcessOutput(outputTensor, confThreshold, letterboxInfo, maxDetections = 50) {
  const data = outputTensor.data; // Float32Array
  const dims = outputTensor.dims; // e.g. [1, 300, 6]
  
  const numDetections = dims[1] || 300;
  const numFeatures = dims[2] || 6;

  const { scale, dx, dy, origWidth, origHeight } = letterboxInfo;

  const detections = [];

  for (let i = 0; i < numDetections; i++) {
    const offset = i * numFeatures;
    const confidence = data[offset + 4];

    if (confidence >= confThreshold) {
      const classId = Math.round(data[offset + 5]);
      
      // Coordinates in 640x640 letterbox space
      let x1 = data[offset];
      let y1 = data[offset + 1];
      let x2 = data[offset + 2];
      let y2 = data[offset + 3];

      // Remove letterbox padding and rescale back to original image coordinates
      let origX1 = (x1 - dx) / scale;
      let origY1 = (y1 - dy) / scale;
      let origX2 = (x2 - dx) / scale;
      let origY2 = (y2 - dy) / scale;

      // Clamp to image bounds
      origX1 = Math.max(0, Math.min(origWidth, origX1));
      origY1 = Math.max(0, Math.min(origHeight, origY1));
      origX2 = Math.max(0, Math.min(origWidth, origX2));
      origY2 = Math.max(0, Math.min(origHeight, origY2));

      detections.push({
        x1: origX1,
        y1: origY1,
        x2: origX2,
        y2: origY2,
        boxWidth: origX2 - origX1,
        boxHeight: origY2 - origY1,
        confidence,
        classId,
        className: CLASS_NAMES[classId] || `class-${classId}`
      });

      if (detections.length >= maxDetections) break;
    }
  }

  return detections;
}

// Color palettes for bounding boxes
const BOX_COLORS = {
  cyan: { stroke: '#06b6d4', fill: 'rgba(6, 182, 212, 0.15)', textBg: 'rgba(6, 182, 212, 0.95)', textColor: '#090d16' },
  emerald: { stroke: '#10b981', fill: 'rgba(16, 185, 129, 0.15)', textBg: 'rgba(16, 185, 129, 0.95)', textColor: '#090d16' },
  rose: { stroke: '#f43f5e', fill: 'rgba(244, 63, 94, 0.15)', textBg: 'rgba(244, 63, 94, 0.95)', textColor: '#ffffff' },
  amber: { stroke: '#f59e0b', fill: 'rgba(245, 158, 11, 0.15)', textBg: 'rgba(245, 158, 11, 0.95)', textColor: '#090d16' }
};

/**
 * Draw bounding boxes and labels on transparent overlay canvas
 */
function drawDetections(overlayCanvas, detections, origWidth, origHeight, options = {}) {
  const { showLabels = true, boxTheme = 'cyan' } = options;
  const color = BOX_COLORS[boxTheme] || BOX_COLORS.cyan;

  const ctx = overlayCanvas.getContext('2d');
  
  // Set internal canvas resolution to match natural/original dimensions
  overlayCanvas.width = origWidth;
  overlayCanvas.height = origHeight;
  
  ctx.clearRect(0, 0, origWidth, origHeight);

  if (detections.length === 0) return;

  ctx.lineWidth = Math.max(3, Math.round(origWidth / 300));

  detections.forEach(det => {
    const { x1, y1, boxWidth, boxHeight, confidence, className } = det;

    // Glowing Bounding Box
    ctx.shadowColor = color.stroke;
    ctx.shadowBlur = 12;
    ctx.strokeStyle = color.stroke;
    ctx.fillStyle = color.fill;

    // Rounded rectangle box
    const radius = 6;
    ctx.beginPath();
    ctx.roundRect(x1, y1, boxWidth, boxHeight, radius);
    ctx.fill();
    ctx.stroke();

    // Reset shadow
    ctx.shadowBlur = 0;

    if (showLabels) {
      // Label Text
      const confPercent = (confidence * 100).toFixed(1) + '%';
      const labelText = `${className} ${confPercent}`;

      const fontSize = Math.max(14, Math.round(origWidth / 45));
      ctx.font = `600 ${fontSize}px 'Inter', sans-serif`;

      const textMetrics = ctx.measureText(labelText);
      const textWidth = textMetrics.width;
      const textHeight = fontSize;

      const padX = 8;
      const padY = 5;

      // Position label above box if space allows, otherwise inside top
      let labelY = y1 - textHeight - (padY * 2);
      if (labelY < 0) {
        labelY = y1 + 4;
      }

      // Label background pill
      ctx.fillStyle = color.textBg;
      ctx.beginPath();
      ctx.roundRect(x1, labelY, textWidth + (padX * 2), textHeight + (padY * 2), 4);
      ctx.fill();

      // Label text
      ctx.fillStyle = color.textColor;
      ctx.fillText(labelText, x1 + padX, labelY + textHeight);
    }
  });
}
