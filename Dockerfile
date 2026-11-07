# Build context = repo root; the app and its static assets (web/public) are all under web/.
FROM node:22-slim
WORKDIR /app
COPY web/package*.json ./
RUN npm ci
COPY web/ ./
RUN npm run build
ENV NODE_ENV=production
EXPOSE 3000
CMD ["npm", "start"]
