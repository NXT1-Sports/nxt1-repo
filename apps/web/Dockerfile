# Dockerfile for NXT1 Web SSR (Angular Universal)
# Use official Node.js LTS image
FROM node:22-slim

# Set working directory
WORKDIR /app

# Copy package.json and package-lock.json
COPY package.json package-lock.json ./

# Install dependencies (production only)
RUN npm ci --omit=dev

# Copy built SSR output (assumes build done before Docker build)
COPY dist/nxt1-web ./dist/nxt1-web

# Expose Cloud Run port
EXPOSE 8080

# Set environment variables
ENV NODE_ENV=production
ENV PORT=8080

# Start the SSR server
CMD ["node", "dist/nxt1-web/server/server.mjs"]
