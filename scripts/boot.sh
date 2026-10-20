#!/bin/sh
# Fly machine start command:  sh /data/boot.sh   (copy of this file)
# Every boot pulls the GitHub ref in /data/gh/REF (default heads/main), checks it, and runs it.
# Fallbacks: last good GitHub copy -> /data/patch/app overlay -> image /app.
# Rollback:  echo tags/<tag> > /data/gh/REF && restart.   Kill switch: touch /data/gh/DISABLE.
G=/data/gh; mkdir -p "$G"
RUN="node --disable-warning=ExperimentalWarning server/server.js"
if [ ! -f "$G/DISABLE" ]; then
  REF=$(cat "$G/REF" 2>/dev/null || echo heads/main)
  URL="https://codeload.github.com/Xrpassassin/burn-city/tar.gz/refs/$REF"
  if node -e "fetch(process.argv[1],{signal:AbortSignal.timeout(30000)}).then(r=>{if(!r.ok)process.exit(1);return r.arrayBuffer()}).then(b=>require('fs').writeFileSync(process.argv[2],Buffer.from(b))).catch(()=>process.exit(1))" "$URL" "$G/m.tgz"; then
    rm -rf "$G/new" && mkdir "$G/new" && tar xzf "$G/m.tgz" -C "$G/new" --strip-components=1 \
      && node --check "$G/new/server/server.js" && node --check "$G/new/server/game.js" \
      && { rm -rf "$G/prev"; [ -d "$G/cur" ] && mv "$G/cur" "$G/prev"; mv "$G/new" "$G/cur"; echo "boot: running GitHub $REF"; } \
      || echo "boot: new code failed checks, keeping last good copy"
  else
    echo "boot: GitHub download failed, keeping last good copy"
  fi
  if [ -f "$G/cur/server/server.js" ]; then
    cd "$G/cur" && ln -sfn /app/node_modules node_modules && exec $RUN
  fi
fi
if [ -f /data/patch/app/server/server.js ] && [ ! -f /data/patch/DISABLE ]; then cd /data/patch/app; else cd /app; fi
echo "boot: fallback $(pwd)"; exec $RUN
