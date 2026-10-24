FROM node:24-bookworm-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build
ENV NODE_ENV=production HOST=0.0.0.0 PORT=4317 DB_PATH=/data/taskslice.sqlite APP_MODE=sandbox PAYPAL_ENV=sandbox
RUN mkdir -p /data && chown -R node:node /data /app
USER node
EXPOSE 4317
VOLUME ["/data"]
CMD ["npm", "start"]
