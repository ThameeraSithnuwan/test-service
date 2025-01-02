# dockerfile
FROM node:18-alpine as build

WORKDIR /usr/src/app

RUN apk add --update python3 make g++\
   && rm -rf /var/cache/apk/*

COPY ../package*.json ./


RUN npm install

COPY ../ .

RUN npm run build


FROM node:18-alpine

WORKDIR /usr/src/app

# Install required dependencies
RUN apk --no-cache add curl bash gawk go ca-certificates

RUN apk add --update python3 make g++\
   && rm -rf /var/cache/apk/*

# install kubectl
RUN apk add --update curl && \
    curl -LO https://storage.googleapis.com/kubernetes-release/release/v1.18.0/bin/linux/amd64/kubectl && \
    chmod +x ./kubectl && \
    mv ./kubectl /usr/local/bin/kubectl

# install bash
RUN apk add --no-cache bash

# install gawk
RUN apk add --no-cache gawk

# install go
RUN apk add --no-cache go

ENV PATH="/root/go/bin:${PATH}"

RUN go install github.com/controlplaneio/kubesec/v2@v2.13.0



# Install k8sgpt
RUN curl -LO https://github.com/k8sgpt-ai/k8sgpt/releases/download/v0.3.24/k8sgpt_amd64.apk\
    && apk add --no-cache --allow-untrusted k8sgpt_amd64.apk

# install fluxcd
# RUN curl -s https://fluxcd.io/install.sh |  FLUX_VERSION=2.2.2 bash
RUN curl -s https://fluxcd.io/install.sh | bash

# install shasum
RUN apk add --no-cache perl-utils

# install kapp
RUN wget -O- https://carvel.dev/install.sh > install.sh && \
    chmod +x install.sh && \
    /bin/bash ./install.sh kapp && \
    rm install.sh


COPY --from=build /usr/src/app/node_modules ./node_modules
COPY --from=build /usr/src/app/dist/agent ./dist/agent
COPY --from=build /usr/src/app/dist/common ./dist/common


CMD ["node", "dist/agent/main.js"]



