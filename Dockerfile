FROM node:23

WORKDIR /

COPY package*.json ./

RUN npm install

COPY . .

RUN npm install -g pm2

EXPOSE 9500

CMD ["pm2-runtime", "start", "ecosystem.config.js"]