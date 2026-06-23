FROM node:22-alpine

RUN apk add --no-cache python3 make g++

WORKDIR /app

COPY package*.json ./
COPY server/package*.json ./server/
COPY client/package*.json ./client/

RUN npm --prefix server install
RUN npm --prefix client install

COPY . .

RUN npm run build

EXPOSE 3001

CMD ["npm", "--prefix", "server", "run", "start"]
