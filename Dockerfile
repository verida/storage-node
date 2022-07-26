FROM node:14.17.1-slim as node
FROM ubuntu:focal-20220531 as base
COPY --from=node /usr/local/include/ /usr/local/include/
COPY --from=node /usr/local/lib/ /usr/local/lib/
COPY --from=node /usr/local/bin/ /usr/local/bin/
COPY --from=node /opt/ /opt

RUN apt-get update \
    && apt-get -qq install -y --no-install-recommends \
    git ca-certificates tini \
    && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
EXPOSE 5000

RUN groupadd --gid 1000 node \
  && useradd --uid 1000 --gid node --shell /bin/bash --create-home node
RUN mkdir /storage-node && chown -R node:node /storage-node
WORKDIR /storage-node
USER node
COPY --chown=node:node package.json yarn.lock ./
RUN echo $PATH
RUN yarn --version
RUN yarn install --prod --frozen-lockfile

FROM base as source
COPY --chown=node:node . .

### prod stage
FROM source as prod
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "./src/server.js"]