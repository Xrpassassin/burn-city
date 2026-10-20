#!/bin/sh
# Fly machine start command:  sh /data/boot.sh   (a copy of this file on the volume)
# Self-deploying supervisor:
#  - pulls the GitHub ref in /data/gh/REF (default heads/main), syntax-checks it, runs it from /data/gh/cur
#  - every POLL seconds checks GitHub main; when it changes, restarts onto the new commit (live in ~3 min)
#  - bad download/checks -> keeps last good copy; crash within 30s -> next run uses previous copy
#  - fallbacks: /data/gh/cur -> /data/patch/app (legacy, if present) -> image /app
# Pin/rollback: echo tags/<tag> > /data/gh/REF (polling pauses while pinned).  Kill switch: touch /data/gh/DISABLE
G=/data/gh; mkdir -p "$G"; POLL=${POLL:-180}
REPO=Xrpassassin/burn-city
PID=
trap 'echo "boot: stopping"; [ -n "$PID" ] && kill -TERM $PID 2>/dev/null && wait $PID; exit 0' TERM INT

fetch() { node -e "fetch(process.argv[1],{headers:{'Accept':'application/vnd.github.sha','User-Agent':'burn-city-boot'},signal:AbortSignal.timeout(30000)}).then(r=>{if(!r.ok)process.exit(1);return r.arrayBuffer()}).then(b=>{b=Buffer.from(b);if(process.argv[2]==='-')process.stdout.write(b);else require('fs').writeFileSync(process.argv[2],b)}).catch(()=>process.exit(1))" "$1" "$2"; }

pull() {
  REF=$(cat "$G/REF" 2>/dev/null || echo heads/main)
  SHA=$(fetch "https://api.github.com/repos/$REPO/commits/${REF#*/}" - 2>/dev/null)
  [ ${#SHA} -eq 40 ] || { echo "boot: GitHub unreachable, keeping last good copy"; return; }
  fetch "https://codeload.github.com/$REPO/tar.gz/$SHA" "$G/m.tgz" || { echo "boot: download failed, keeping last good copy"; return; }
  rm -rf "$G/new" && mkdir "$G/new" && tar xzf "$G/m.tgz" -C "$G/new" --strip-components=1 \
    && node --check "$G/new/server/server.js" && node --check "$G/new/server/game.js" \
    && { rm -rf "$G/prev"; [ -d "$G/cur" ] && mv "$G/cur" "$G/prev"; mv "$G/new" "$G/cur"; echo "$SHA" > "$G/SHA"; echo "boot: deployed $REF $SHA"; } \
    || echo "boot: new code failed checks, keeping last good copy"
}

USEPREV=
while true; do
  DIR=/app
  if [ -f /data/patch/app/server/server.js ] && [ ! -f /data/patch/DISABLE ]; then DIR=/data/patch/app; fi
  if [ ! -f "$G/DISABLE" ]; then
    [ -z "$USEPREV" ] && pull
    if [ -n "$USEPREV" ] && [ -f "$G/prev/server/server.js" ]; then DIR="$G/prev"; elif [ -f "$G/cur/server/server.js" ]; then DIR="$G/cur"; fi
  fi
  USEPREV=
  cd "$DIR"; [ "$DIR" != /app ] && ln -sfn /app/node_modules node_modules
  echo "boot: starting from $DIR"
  START=$(date +%s)
  node --disable-warning=ExperimentalWarning server/server.js & PID=$!
  while kill -0 $PID 2>/dev/null; do
    sleep "$POLL" & wait $!
    [ -f "$G/DISABLE" ] || [ -f "$G/REF" ] && continue
    NEW=$(fetch "https://api.github.com/repos/$REPO/commits/main" - 2>/dev/null)
    if [ ${#NEW} -eq 40 ] && [ "$NEW" != "$(cat "$G/SHA" 2>/dev/null)" ]; then
      echo "boot: main moved to $NEW, redeploying"; kill -TERM $PID; wait $PID; break
    fi
  done
  wait $PID 2>/dev/null
  if [ $(( $(date +%s) - START )) -lt 30 ]; then echo "boot: crashed fast, trying previous copy"; USEPREV=1; sleep 3; fi
  PID=
done
