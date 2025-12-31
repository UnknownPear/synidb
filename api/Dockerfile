FROM node:20-bullseye-slim AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci

FROM node:20-bullseye-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate && npm run build

FROM node:20-bullseye-slim
WORKDIR /app
ENV NODE_ENV=production
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
ENV PORT=3000
EXPOSE 3000
CMD ["node","dist/index.js"]

FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app
COPY api/requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt

# If you want playwright support later, uncomment (adds ~300MB):
# RUN pip install playwright && playwright install --with-deps chromium

COPY api /app

# We'll bind on $PORT (defaults to 3333 in your code)
EXPOSE 3000

# Use Gunicorn (prod-safe). Your Flask object is "app" in "app.py" → "app:app"
CMD ["gunicorn", "-w", "2", "-k", "gthread", "-b", "0.0.0.0:3000", "app:app"]
