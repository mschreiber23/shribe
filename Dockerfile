FROM node:22-alpine

RUN apk add --no-cache python3 make g++

WORKDIR /app

COPY server/package*.json ./server/
COPY client/package*.json ./client/

RUN npm --prefix server install --production=false
RUN npm --prefix client install --production=false

COPY . .

RUN npm --prefix client run build

ENV NODE_ENV=production
ENV PORT=3001

EXPOSE 3001

CMD ["node", "server/src/index.js"]
