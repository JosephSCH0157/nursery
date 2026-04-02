FROM jrottenberg/ffmpeg:6.0-alpine

WORKDIR /app

RUN apk add --no-cache nodejs npm

COPY package.json ./
COPY server.mjs ./

EXPOSE 8080

ENTRYPOINT ["node", "server.mjs"]
