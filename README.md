# Welcome to Verida Storage Node Server

This server acts as middleware between web applications built using the [Verida Datastore](https://developers.verida.io/docs/concepts/data-storage/) and the underlying databases storing user data.

Key features:

- Ensuring all API requests come from verified Verida network users (via user signed messages)
- Managing database users, linking them to valid DID's
- Managing permissions for individual databases
- Adding a second layer of security by managing per-database ACL validation rules
- Providing applications with user's database connection strings

## How Authorization Works

This is the login flow:

1. The Verida Account makes a request to the storage node API to obtain an auth JWT to be signed (`/auth/generateAuthJwt`). This prevents replay attacks.
2. The Verida Account signs a consent message using their private key. This consent message proves the user wants to unlock a specific application context
3. The Verida Account submits the signed authorization request (`/auth/authenticate`). Assuming the signed AuthJWT is valid, the storage node returns a refresh token and an access token
4. The Verida Account can then use the access token to either; 1) make storage node requests (ie: create database) or 2) directly access CouchDB as an authenticated user (using `Bearer` token auth)
5. When the access token expires, the Verida Account can use the refresh token to request a new access token (`/auth/connect`)
6. If a refresh token is close to expiry, the Verida Account can use the active refresh token to obtain a new refresh token (`/auth/regenerateRefreshToken`)

When a Verida Account authenticates, it can designate an `authenticate` requst to be linked to a particular device by specifying the `deviceId` in the request.

This allows a specific device to be linked to a refresh token. A call to `/auth/invalidateDeviceId` can be used to invalidate any refresh tokens linked to the specified `deviceId`. This allows the Verida Vault to remotely log out an application that previously logged in.

Note: This only invalidates the refresh token. The access token will remain valid until it expires. It's for this reason that access tokens are configured to have a short expiry (5 minutes by default). CouchDB does not support manually invalidating access tokens, so we have to take this timeout approach to invalidation.

## Usage

```bash
yarn install
yarn build
yarn serve
```

Note: You may need to update `.env` to point to the appropriate Verida DID Server endpoint to use. By default it points to `testnet`, but you can point to a localhost instance for development purposes (http://localhost:5001) -- note, there is no trailing `/`

This server is running on the Verida Testnet and is accessible by any application built on the Verida network during the pre-launch phase.

### Testnet
- https://db.testnet.verida.tech/
- https://messages.testnet.verida.tech/

## Configuration

A `sample.env` is included. Copy this to `.env` and update the configuration:

- `DID_SERVER_URL`: URL of a Verida DID Server endpoint.
- `DB_PROTOCOL`: Protocol to use when connecting to CouchDB (`http` or `https`).
- `DB_USER`: Username of CouchDB Admin (has access to create users and databases).
- `DB_PASS`: Password of CouchDB Admin.
- `DB_HOST`: Hostname of CouchDB Admin.
- `DB_PORT`: Port of CouchDB server (`5984`).
- `DB_REJECT_UNAUTHORIZED_SSL`: Boolean indicating if unauthorized SSL certificates should be rejected (`true` or `false`). Defaults to `false` for development testing. Must be `true` for production environments otherwise SSL certificates won't be verified.
- `DB_PUBLIC_USER`: Alphanumeric string for a public database user. These credentials can be requested by anyone and provide access to all databases where the permissions have been set to `public`.
- `DB_PUBLIC_PASS`: Alphanumeric string for a public database password.
- `ACCESS_TOKEN_EXPIRY`: Number of seconds before an access token expires. The protocol will use the refresh token to obtain a new access token. CouchDB does not support a way to force the expiry of an issued token, so the access token expiry should always be set to 5 minutes (300)
- `REFRESH_TOKEN_EXPIRY`: Number of seconds before a refresh token expires. Users will be forced to re-login once this time limit is reached. This should be set to 7 days (604800).
- `ACCESS_JWT_SIGN_PK`: The access token private key. The base64 version of this must be specified in the CouchDB configuration under `jwt_keys/hmac:_default`
- `REFRESH_JWT_SIGN_PK`: The refresh token private key

### Setting up environment variables on Windows

* On a powershell execute the following ( replica of `.env` )
```bash
$env:HASH_KEY="this_is_not_prod_hash_key"
$env:DID_SERVER_URL="https://dids.testnet.verida.io:5001"
$env:DID_CACHE_DURATION=3600
$env:DB_PROTOCOL="http"
$env:DB_USER="admin"
$env:DB_PASS="admin"
$env:DB_HOST="localhost"
$env:DB_PORT=5984
$env:DB_REJECT_UNAUTHORIZED_SSL=false
$env:DB_PUBLIC_USER="784c2n780c9cn0789"
$env:DB_PUBLIC_PASS="784c2n780c9cn0789"
```

## CouchDB configuration

- CORS must be enabled so that database requests can come from any domain name
- A valid user must be enforced for security reasons

[Ensure `{chttpd_auth, jwt_authentication_handler}` is added to the list of the active `chttpd/authentication_handlers`](https://docs.couchdb.org/en/stable/api/server/authn.html?highlight=jwt#jwt-authentication)



```
[couchdb]
single_node=true

[chttpd]
authentication_handlers = {chttpd_auth, jwt_authentication_handler}, {chttpd_auth, cookie_authentication_handler}, {chttpd_auth, default_authentication_handler}
enable_cors = true

[chttpd_auth]
require_valid_user = true

[jwt_auth]
required_claims = exp

[jwt_keys]
hmac:_default = <base64 secret key>

[cors]
origins = *
credentials = true
methods = GET, PUT, POST, HEAD, DELETE
headers = accept, authorization, content-type, origin, referer, x-csrf-token
```

The `hmac:_default` key is a base64 encoded representation of the access token JWT private key

## Generating JWT key

Note: A secret key (string) suitable for `jwt_keys` can be base64 encoded with the following:

```
const secretKey = 'secretKey'
const encodedKey = Buffer.from(secretKey).toString('base64')
```

This can be tested via curl:

```
curl -H "Host: localhost:5984" \
 -H "accept: application/json, text/plain, */*" \
 -H "authorization: Bearer <bearer_token>" \
  "http://localhost:5984/_session"
```

Where:

- `bearer_token` - A bearer token generated via the `test/jwt` unit test
- `localhost` - Replace this with the hostname of the server being tested

## Docker

You can spin up storage node API on your machine with Docker:
```shell
docker run --init --env-file=.env verida/storage-node:latest
```

Using the example [docker-compose.yml](./docker-compose.yml) you can run storage node together with CouchDB. 
```shell
docker compose up
```

### Deploying a new Docker Image to Docker Hub

Note that this uses the experimental `buildx` command to build both AMD64 (Intel/AMD servers) and ARM64 (Mac) images.

* Login (details in BitWarden)
```
docker buildx build --platform linux/amd64,linux/arm64 --push -t verida/storage-node:latest .
```


## Tests

Run tests with `yarn run tests`

Note: The tests in `server.js` require the server to be running locally. The other tests operate fine without the server running.

Common issues when running tests:

1. `Bad key`: The key in CouchDB configuration for `jwt_keys/hmac:_default` is not a valid Base64 encoded key
2. `HMAC error`: The key in CouchDB configuration for `jwt_keys/hmac:_default` does not match `ACCESS_JWT_SIGN_PK` in `.env`
