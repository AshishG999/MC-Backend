FROM node:23

WORKDIR /

COPY package*.json ./

RUN npm install

COPY . .

RUN npm install -g pm2

EXPOSE 4000

CMD ["pm2-runtime", "start", "pm2.config.js"]