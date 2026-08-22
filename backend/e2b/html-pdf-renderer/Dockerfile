FROM node:22-bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
ENV CHROME_EXECUTABLE_PATH=/usr/bin/chromium

RUN apt-get update && apt-get install -y --no-install-recommends \
  chromium \
  ca-certificates \
  fonts-dejavu-core \
  fonts-liberation \
  fonts-noto-color-emoji \
  fonts-noto-cjk \
  git \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /home/user

RUN npm init -y && npm install playwright@1.62.1
