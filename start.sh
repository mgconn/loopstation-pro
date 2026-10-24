#!/bin/sh
# Serves LoopStation Pro at http://localhost:8765 (needed for install-as-app, offline mode and MIDI)
cd "$(dirname "$0")" && echo "Open http://localhost:8765 in Chrome" && python3 -m http.server 8765
