FROM node:22-slim

ENV NODE_ENV=production \
    PORT=8080 \
    HOST=0.0.0.0 \
    CHART_MCP_PATH=/mcp \
    CHART_MCP_INTERNAL_HOST=127.0.0.1 \
    CHART_MCP_INTERNAL_PORT=1122 \
    NPM_CONFIG_UPDATE_NOTIFIER=false \
    npm_config_yes=true

WORKDIR /app

COPY mcp/chart-mcp/package.json /app/package.json
RUN npm install --omit=dev && npm cache clean --force

COPY mcp/chart-mcp/app.js /app/app.js

EXPOSE 8080

CMD ["npm", "run", "start"]