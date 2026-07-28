# Expired Product Detector (WebGPU + WASM)

A real-time AI-powered web application designed to detect expired products (`detection-expired`) directly inside the web browser using **ONNX Runtime Web (WebGPU & WebAssembly)** with Ultralytics YOLO26m.

![License](https://img.shields.io/badge/License-AGPL--3.0-blue.svg)
![ONNX Runtime](https://img.shields.io/badge/ONNX_Runtime_Web-1.22.0-cyan.svg)
![YOLO26m](https://img.shields.io/badge/YOLO-26m_End2End-violet.svg)

---

## 🌟 Features

- ⚡ **Zero-Server Browser Inference**: Operates 100% on the client side using WebGPU / WASM without sending images or video frames to any remote server.
- 🚀 **Hardware Accelerated**: Automatically utilizes **WebGPU** for fast GPU acceleration, with a graceful fallback to **WebAssembly (WASM)** for older devices.
- 📸 **Multi-Format Media Upload**: Supports drag-and-drop or file selection for both **Photos** (`JPG`, `PNG`, `WebP`) and **Videos** (`MP4`, `WebM`, `MOV`).
- 🎥 **Live Camera Detection**: Perform real-time continuous object detection using your device's webcam.
- 🎯 **End-to-End YOLO Head**: Model outputs decoded bounding boxes directly (`[x1, y1, x2, y2, confidence, class_id]`), eliminating custom JavaScript NMS overhead.
- 🎨 **Modern Dark Glassmorphism UI**: Beautiful, responsive user interface with real-time inference statistics and interactive confidence threshold adjustments.

---

## 🛠️ Technology Stack

- **Frontend**: Vanilla HTML5, Modern CSS3 (Glassmorphism design system), JavaScript (ES6+)
- **AI Runtime**: [ONNX Runtime Web](https://onnxruntime.ai/docs/tutorials/web/)
- **Model**: Ultralytics YOLO26m (`best.onnx`)

---

## 🚀 Quick Start

1. Clone or download this repository:
   ```bash
   git clone https://github.com/bimoBintang/object-expired.git
   cd object-expired
   ```

2. Serve the directory using any HTTP web server (required for WebAssembly `.wasm` and `.onnx` loading):
   ```bash
   # Using Python 3
   python3 -m http.server 8080
   
   # Or using Node.js npx
   npx serve .
   ```

3. Open your web browser and navigate to:
   ```text
   http://localhost:8080
   ```

---

## 📂 Project Structure

```
object-expired/
├── index.html        # Main HTML layout & semantical elements
├── index.css         # Custom Glassmorphism design system & micro-animations
├── app.js            # Main application controller (Media inputs, webcam loop, UI state)
├── model.js          # ONNX Runtime Web session manager & WebGPU/WASM fallback logic
├── utils.js          # Letterbox preprocessing, tensor layouts, coordinate scaling & canvas rendering
├── best.onnx         # ONNX exported model weights (81.7 MB)
└── README.md         # Project documentation
```

---

## ⚙️ Model Details

| Attribute | Description / Value |
| :--- | :--- |
| **Model Architecture** | Ultralytics YOLO26m |
| **Task** | Object Detection (`detect`) |
| **Target Class** | `{0: 'detection-expired'}` |
| **Input Shape** | `[1, 3, 640, 640]` (RGB Float32 CHW normalized 0-1) |
| **Output Shape** | `[1, 300, 6]` (`[x1, y1, x2, y2, confidence, class_id]`) |
| **Post-Processing** | End-to-end NMS integrated into ONNX graph |

---

## 📄 License

This project utilizes Ultralytics YOLO models under the AGPL-3.0 License.
