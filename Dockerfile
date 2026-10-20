FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY server ./server
COPY client ./client
ENV PORT=8080
EXPOSE 8080
# Boot via /data/boot.sh (pulls GitHub main) when the volume has it; otherwise run the baked-in code.
CMD ["sh","-c","if [ -f /data/boot.sh ]; then exec sh /data/boot.sh; else exec node --disable-warning=ExperimentalWarning server/server.js; fi"]
