FROM node:20-alpine

RUN apk add --no-cache vips-dev

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

RUN mkdir -p data uploads

EXPOSE 8080

CMD ["node", "server.js"]
