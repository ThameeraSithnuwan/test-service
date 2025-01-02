# Server Dockferfile
FROM node:18-alpine as build
WORKDIR /usr/src/app

RUN apk add --update python3 make g++\
   && rm -rf /var/cache/apk/*

COPY package*.json ./


RUN npm install

COPY  . .

RUN npm run build


FROM node:18-alpine

RUN apk add --update python3 make g++\
   && rm -rf /var/cache/apk/*

WORKDIR /usr/src/app

RUN mkdir dist

COPY --from=build /usr/src/app/node_modules ./node_modules
COPY --from=build /usr/src/app/dist/server ./dist/server
COPY --from=build /usr/src/app/dist/common ./dist/common
COPY --from=build /usr/src/app/src/server/configs/connect-template.yaml ./dist/server/configs/connect-template.yaml
COPY --from=build /usr/src/app/src/server/configs/config-operator-install.yaml ./dist/server/configs/config-operator-install.yaml
COPY --from=build /usr/src/app/src/server/configs/shell-job.yaml ./dist/server/configs/shell-job.yaml
COPY --from=build /usr/src/app/src/server/configs/global-bundle.pem global-bundle.pem
COPY agentVersion.txt agentVersion.txt

RUN echo '{ }' > ./config.json

# Fixing vulnerabilities
RUN apk upgrade libssl3 libcrypto3

CMD ["node", "dist/server/main.js"]



