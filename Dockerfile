FROM node:22-alpine

RUN apk add --no-cache python3 make g++

WORKDIR /app

COPY package*.json ./
COPY server/package*.json ./server/
COPY client/package*.json ./client/

RUN npm --prefix server install
RUN npm --prefix client install

COPY . .

ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL
ENV VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY

# Railway does not have the Supabase keys. Keep the current site there and
# add the backup download page. GitHub Pages builds the new site instead.
RUN if [ -z "$VITE_SUPABASE_URL" ] || [ -z "$VITE_SUPABASE_ANON_KEY" ]; then \
      cp client-legacy/index.html client/index.html && \
      cp client-legacy/vite.config.js client/vite.config.js && \
      rm -rf client/src client/public && \
      cp -a client-legacy/src client/src && \
      cp -a client-legacy/public client/public; \
    fi

RUN npm run build

EXPOSE 3001

CMD ["npm", "--prefix", "server", "run", "start"]
