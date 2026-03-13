FROM node:20-alpine AS base

# ── Build ──
FROM base AS builder
WORKDIR /app
COPY package.json package-lock.json ./
COPY node_modules ./node_modules
COPY . .
RUN npm run build

# ── Production image ──
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

USER nextjs
EXPOSE 3000

CMD ["node", "server.js"]
