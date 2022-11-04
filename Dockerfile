FROM node:14.20.0-slim as node
FROM ubuntu:focal-20220531 as base
COPY --from=node /usr/local/include/ /usr/local/include/
COPY --from=node /usr/local/lib/ /usr/local/lib/
COPY --from=node /usr/local/bin/ /usr/local/bin/

ENV NODE_ENV=production
EXPOSE 5000

RUN groupadd --gid 1000 node \
  && useradd --uid 1000 --gid node --shell /bin/bash --create-home node
RUN mkdir /storage-node && chown -R node:node /storage-node
WORKDIR /storage-node

FROM base as build
# this ensures we fix simlinks for npx and yarn
RUN corepack disable && corepack enable

RUN apt-get update \
    && apt-get -qq install -y --no-install-recommends \
    git ca-certificates \
    && rm -rf /var/lib/apt/lists/*

USER node
COPY --chown=node:node package.json yarn.lock ./
RUN yarn install --prod --frozen-lockfile

FROM base as source
COPY --from=build --chown=node:node /storage-node/node_modules ./node_modules
COPY . .

### prod stage
# Note: use --init option when running the container to have better signal forwarding
FROM source as prod
CMD ["node", "./src/server.js"]
