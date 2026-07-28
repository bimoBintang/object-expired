#!/usr/bin/env python3
"""
Custom HTTP server with Cross-Origin Isolation headers.
Required for WASM multi-threading (SharedArrayBuffer) and WebGPU.

Headers added:
  Cross-Origin-Opener-Policy: same-origin
  Cross-Origin-Embedder-Policy: require-corp

Usage:
  python3 server.py
  python3 server.py 8080
"""

import sys
import os
from http.server import HTTPServer, SimpleHTTPRequestHandler


class CrossOriginIsolatedHandler(SimpleHTTPRequestHandler):
    """HTTP request handler that adds Cross-Origin Isolation headers."""

    def end_headers(self):
        # Required for SharedArrayBuffer (WASM multithreading)
        self.send_header('Cross-Origin-Opener-Policy', 'same-origin')
        self.send_header('Cross-Origin-Embedder-Policy', 'require-corp')
        # Cache-Control for large model files
        if self.path.endswith('.onnx') or self.path.endswith('.wasm'):
            self.send_header('Cache-Control', 'public, max-age=86400')
        super().end_headers()

    def log_message(self, format, *args):
        print(f"[{self.log_date_time_string()}] {format % args}")


if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8080
    # Serve from the directory where this script is located
    os.chdir(os.path.dirname(os.path.abspath(__file__)))

    server = HTTPServer(('localhost', port), CrossOriginIsolatedHandler)
    print(f"✅ Server running at http://localhost:{port}")
    print(f"   Cross-Origin-Opener-Policy : same-origin")
    print(f"   Cross-Origin-Embedder-Policy: require-corp")
    print(f"   WASM multi-threading       : ENABLED")
    print(f"   WebGPU acceleration        : ENABLED")
    print(f"\nPress Ctrl+C to stop.\n")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nServer stopped.")
