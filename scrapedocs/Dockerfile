FROM node:18-slim

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm install

COPY scrape.js ./

# Default command, can be overridden in docker-compose
CMD [ "node", "scrape.js" ]
