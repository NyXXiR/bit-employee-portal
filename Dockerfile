FROM node:20-bookworm

ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /app
RUN chown node:node /app
USER node

COPY --chown=node:node package.json package-lock.json ./
COPY --chown=node:node prisma ./prisma
RUN npm ci --no-audit --no-fund

COPY --chown=node:node . .
RUN npm run build

ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "scripts/bootstrap.mjs", "--start"]
