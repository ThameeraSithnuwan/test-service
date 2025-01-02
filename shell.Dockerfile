# dockerfile
FROM node:18-alpine AS build

WORKDIR /usr/src/app

RUN apk add --update python3 make g++\
   && rm -rf /var/cache/apk/*

COPY ../package*.json ./


RUN npm install

COPY ../ .

RUN npm run build


FROM node:18-alpine

WORKDIR /usr/src/app

ENV COMPLETIONS=/usr/share/bash-completion/completions
ENV TERMINFO=/usr/lib/terminfo
ENV TERM="xterm-256color"
ENV PS1="\W > "

# Install required dependencies
RUN apk update
RUN apk upgrade

RUN apk add --update python3 make g++\
   && rm -rf /var/cache/apk/*

# Install required dependencies
RUN apk --no-cache add curl bash gawk go ca-certificates


# install bash
RUN apk add --no-cache bash

# install gawk
RUN apk add --no-cache gawk

# install go
RUN apk add --no-cache go

ENV PATH="/root/go/bin:${PATH}"

RUN go install github.com/controlplaneio/kubesec/v2@v2.13.0

# install kubectl and kustomize
RUN apk add --no-cache curl && \
    curl -LO https://storage.googleapis.com/kubernetes-release/release/v1.27.0/bin/linux/amd64/kubectl && \
    chmod +x ./kubectl && \
    mv ./kubectl /usr/local/bin/kubectl && \
    curl -s "https://raw.githubusercontent.com/kubernetes-sigs/kustomize/master/hack/install_kustomize.sh"  | bash && \
    mv ./kustomize /usr/local/bin/kustomize

# install bash completion
RUN apk add --no-cache bash-completion

RUN kubectl completion bash > $COMPLETIONS/kubectl.bash

# install openssl
RUN apk add --no-cache openssl

# install helm
RUN curl -fsSL -o get_helm.sh https://raw.githubusercontent.com/helm/helm/master/scripts/get-helm-3 && \
    chmod 700 get_helm.sh && \
    ./get_helm.sh

RUN helm completion bash > $COMPLETIONS/helm.bash

RUN apk add ncurses

# install jq
RUN apk add --no-cache jq

# install git
RUN apk add --no-cache git

RUN cd /tmp \
    && git clone https://github.com/ahmetb/kubectx \
    && cd kubectx \
    && mv kubectx /usr/local/bin/kubectx \
    && mv kubens /usr/local/bin/kubens \
    && mv completion/*.bash $COMPLETIONS \
    && cd .. \
    && rm -rf kubectx

RUN curl -s -L https://toolkit.fluxcd.io/install.sh | bash

# install shasum
RUN apk add --no-cache perl-utils

# install kapp
RUN wget -O- https://carvel.dev/install.sh > install.sh && \
    chmod +x install.sh && \
    /bin/bash ./install.sh kapp && \
    rm install.sh

# install kubectl-slice
RUN curl -LO https://github.com/patrickdappollonio/kubectl-slice/releases/download/v1.3.1/kubectl-slice_linux_x86_64.tar.gz \
    && tar -xzvf kubectl-slice_linux_x86_64.tar.gz \
    && chmod +x kubectl-slice \
    && rm kubectl-slice_linux_x86_64.tar.gz

RUN mv kubectl-slice /usr/local/bin 

COPY --from=build /usr/src/app/node_modules ./node_modules
COPY --from=build /usr/src/app/dist/shell ./dist/shell
COPY --from=build /usr/src/app/dist/common ./dist/common

CMD ["node", "dist/shell/main.js"]
