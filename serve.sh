#!/bin/bash
# Serve PaperGomoku on LAN for Kindle
cd "$(dirname "$0")"
IP=$(ipconfig getifaddr en0 || ipconfig getifaddr en1)
PORT=8933
echo "Serving on:"
echo "  Mac:    http://localhost:$PORT/index.html"
echo "  Kindle: http://$IP:$PORT/index.html"
echo "(Ctrl+C to stop)"
python3 -m http.server $PORT
