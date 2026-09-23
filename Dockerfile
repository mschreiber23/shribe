FROM node:22-alpine

RUN apk add --no-cache python3 make g++

WORKDIR /app

COPY package*.json ./
COPY server/package*.json ./server/
COPY client/package*.json ./client/

RUN npm --prefix server install
RUN npm --prefix client install

COPY . .

# GitHub Pages builds the site with these values. Railway does not have them,
# so a Railway rebuild stops here and the current live app stays up.
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL
ENV VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY
RUN if [ -z "$VITE_SUPABASE_URL" ] || [ -z "$VITE_SUPABASE_ANON_KEY" ]; then echo "Supabase settings are missing from this build"; exit 1; fi

RUN npm run build

EXPOSE 3001

CMD ["npm", "--prefix", "server", "run", "start"]
