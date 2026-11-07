# Build context = repo root (the legacy static assets live outside web/).
FROM node:22-slim
WORKDIR /app
COPY web/package*.json ./
RUN npm ci
COPY web/ ./
# web/public holds symlinks to ../../css etc. for dev; replace them with real copies.
RUN find public -type l -delete
COPY css public/css
COPY js public/js
COPY images public/images
COPY download public/download
COPY dynamic public/dynamic
COPY pdfs public/pdfs
COPY plugins public/plugins
COPY pdfjs public/pdfjs
COPY ical public/ical
COPY cal.ics robots.txt sitemap.xml public/
RUN npm run build
ENV NODE_ENV=production
EXPOSE 3000
CMD ["npm", "start"]
