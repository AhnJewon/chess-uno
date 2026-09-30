FROM node:22-alpine
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY game.html debug.html game.js debug.js multiplayer-v2.js multiplayer-v3.js chess-rules.js cards.js server.js ./
EXPOSE 3000
USER node
CMD ["npm", "start"]
