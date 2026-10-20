FROM node:22-alpine
WORKDIR /app
# AEGIS preview clips (prototype, OFF): the clip job needs yt-dlp + ffmpeg. Build with --build-arg AEGIS_TOOLS=1 to add them
# (~+90 MB image) and set AEGIS_CLIPS=1 at runtime. Default build is unchanged.
ARG AEGIS_TOOLS=0
RUN if [ "$AEGIS_TOOLS" = "1" ]; then apk add --no-cache ffmpeg yt-dlp; fi
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY server ./server
COPY client ./client
ENV PORT=8080
EXPOSE 8080
# Boot via /data/boot.sh (pulls GitHub main) when the volume has it; otherwise run the baked-in code.
CMD ["sh","-c","if [ -f /data/boot.sh ]; then exec sh /data/boot.sh; else exec node --disable-warning=ExperimentalWarning server/server.js; fi"]
