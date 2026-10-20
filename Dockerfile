FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY server ./server
COPY client ./client
ENV PORT=8080
EXPOSE 8080
CMD ["node","--disable-warning=ExperimentalWarning","server/server.js"]
