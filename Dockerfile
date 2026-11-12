# 零外部依赖，无需 npm install 即可运行
FROM node:20-alpine

WORKDIR /app

# 数据默认落在 /app/data，图片落在 /app/public/uploads
# 平台如提供持久卷，把 DATA_DIR / UPLOAD_DIR 指过去即可
COPY server.js package.json ./
COPY public/ ./public/
COPY data/ ./data/
COPY tests/ ./tests/

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

# 非 root 运行；镜像内 public/uploads 需可写
RUN mkdir -p /app/public/uploads /app/data && chown -R node:node /app
USER node

CMD ["node", "server.js"]
