#!/bin/bash
# Dev-only. See README.md. Uses a copy of ../../../lobsters in $WORK so that directory stays untouched.
set -e
HERE="$(cd "$(dirname "$0")" && pwd)"; WEB="$HERE/../.."; WORK="${WORK:-/tmp/feed-parity}"
mkdir -p "$WORK/app" "$WORK/out"
rsync -a --exclude .git --exclude log --exclude tmp --exclude 'db/*.sqlite3*' "$WEB/../lobsters/" "$WORK/app/"
cat > "$WORK/Dockerfile" <<'D'
FROM ruby:4.0.10
RUN apt-get update -qq && apt-get install -y build-essential libjemalloc2 libvips clang git && rm -rf /var/lib/apt/lists/*
WORKDIR /lobsters
RUN gem install bundler
COPY app/Gemfile app/Gemfile.lock app/.ruby-version ./
COPY app/.bundle ./.bundle
RUN bundle install
COPY app/ ./
ENV RAILS_ENV=development
D
docker build -t lobsters-ref "$WORK"
cp "$WORK/app/config/database.yml.sample" "$WORK/app/config/database.yml" 2>/dev/null || true
docker rm -f lobsters-ref >/dev/null 2>&1 || true
docker run -d --name lobsters-ref -p 3001:3000 -v "$WORK/out:/out" -v "$HERE/export.rb:/export.rb:ro" lobsters-ref sleep infinity >/dev/null
docker exec lobsters-ref bash -c "cp config/database.yml.sample config/database.yml; bin/rails db:setup && bin/rails fake_data && bin/rails runner /export.rb /out"
docker exec -d lobsters-ref bin/rails server -b 0.0.0.0
docker rm -f feedpg >/dev/null 2>&1 || true
docker run -d --rm --name feedpg -e POSTGRES_PASSWORD=x -p 54329:5432 postgres:16 >/dev/null
until docker exec feedpg pg_isready -U postgres >/dev/null 2>&1; do sleep 1; done
export DATABASE_URL=postgres://postgres:x@localhost:54329/postgres
(cd "$WEB" && FEED_DEV=1 npx next dev -p 3111 >"$WORK/next.log" 2>&1 &)
until curl -s -o /dev/null localhost:3111/admin-login; do sleep 2; done   # first request creates the schema
(cd "$WEB" && node scripts/feed-parity/import.mjs "$WORK/out")
until curl -s -o /dev/null localhost:3001/; do sleep 2; done
(cd "$WEB" && EXPORT_DIR="$WORK/out" node scripts/feed-parity/compare.mjs http://localhost:3001 http://localhost:3111)
