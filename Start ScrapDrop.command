#!/bin/zsh
cd -- "${0:A:h}" || exit 1
if ! command -v node >/dev/null 2>&1; then
  print 'ScrapDrop needs Node.js 24 or newer. See README.md.'
  read '?Press Enter to close.'
  exit 1
fi
if [[ ! -d node_modules ]]; then
  npm ci --include=dev || exit 1
fi
export PORT="${SCRAPDROP_PORT:-4321}"
export APP_BASE_URL="http://127.0.0.1:$PORT"
export AI_MODE="${AI_MODE:-fixture}"
if curl --silent --fail "$APP_BASE_URL/api/scrapdrop/shop" >/dev/null 2>&1; then
  print "ScrapDrop is already running. Open $APP_BASE_URL"
  read '?Press Enter to close.'
  exit 0
fi
print "Open $APP_BASE_URL after ScrapDrop starts. Press Control-C to stop."
npm run dev
