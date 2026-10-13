FROM node:22-slim

WORKDIR /app

# Install production deps + tsx for TS execution
COPY package*.json ./
RUN npm ci --omit=dev && npm install --no-save tsx@4 esbuild@0.24

# Copy only what's needed to extract
COPY tsconfig.json ./
COPY realm-ids.json ./
COPY scripts/extract-direct.ts scripts/
COPY src/ src/

ENV NODE_ENV=production
ENV BLIZZARD_LOCALE=en_US

CMD ["node", "--experimental-strip-types", "scripts/extract-direct.ts", "eu"]