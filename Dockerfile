# syntax=docker/dockerfile:1

# 依赖层：verify 与 build 共用
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# 一次性 verify 服务：代码测试 + 构建 + 对已启动页面的冒烟（冒烟目标地址由环境变量给出）
FROM deps AS verify
COPY . .
ENV WEB_HOST=web \
    WEB_PORT=8080
CMD ["npm", "run", "verify:container"]

# 构建层：先跑测试再产出静态资源
FROM deps AS build
COPY . .
RUN npm run test && npm run build

# 运行层：零依赖静态服务器 + 健康检查
FROM node:20-alpine AS web
WORKDIR /app
ENV NODE_ENV=production \
    PORT=8080
COPY --from=build /app/dist ./dist
COPY server.mjs ./
EXPOSE 8080
HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=6 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.mjs"]
