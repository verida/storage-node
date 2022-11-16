FROM node:14.20.0-slim as node

ENV NODE_ENV=production
EXPOSE 5000

RUN mkdir /storage-node && chown -R node:node /storage-node
WORKDIR /storage-node

# this ensures we fix simlinks for npx and yarn
RUN corepack disable && corepack enable

RUN apt-get update \
    && apt-get -qq install -y --no-install-recommends \
    git ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# new stage
FROM node AS source

USER node
# Copy the current directory
COPY --chown=node:node . .

# we need devDependencies to build. Setting --production=false ignores NODE_ENV (deliberatly)
RUN yarn install --production=false --frozen-lockfile
# we have to build inside the container in case we are on a Mac building a linux image
RUN yarn build


### prod stage
# Note: use --init option when running the container to have better signal forwarding
FROM source as prod
CMD ["node", "--trace-warnings", "./dist/server.js"]
