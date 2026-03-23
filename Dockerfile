FROM node:20-alpine

WORKDIR /app

COPY app/package*.json ./
RUN npm ci --omit=dev

COPY app/src ./src

EXPOSE 3002
ENV PORT=3002 NODE_ENV=production BASE_PATH=/idv-demo

CMD ["node", "src/server.js"]
