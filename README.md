# Welcome to Verida Storage Node Server

This server acts as middleware between web applications built using the [Verida Datastore](http://www.github.com/verida/datastore) and the underlying databases storing user data.

Key features:

- Ensuring all API requests come from verified Verida network users (via user signed messages)
- Managing database users, linking them to valid DID's
- Managing permissions for individual databases
- Adding a second layer of security by managing per-database ACL validation rules
- Providing applications with user's database connection strings

## Usage

```
$ yarn install
$ yarn run start
```

Note: You may need to update `.env` to point to the appropriate Verida DID Server endpoint to use. By default it points to `testnet`, but you can point to a localhost instance for development purposes (http://localhost:5001) -- note, there is no trailing `/`

This server is running on the Verida Testnet and is accessible by any application built on the Verida network during the pre-launch phase.

- Testnet: https://db.testnet.verida.io:5002/

## Configuration

Edit `.env` to update the configuration:

- `HASH_KEY`: A unique hash key that is used as entropy when generating an alpha numeric username from a DID. Set this to a unique value when first running the server. DO NOT change this key once the server is up and running as you will end up with a mismatch of usernames. If you run multiple servers in front of a cluster of CouchDB instances, all servers must use the same `HASH_KEY`.
- `DID_SERVER_URL`: URL of a Verida DID Server endpoint.
- `DB_PROTOCOL`: Protocol to use when connecting to CouchDB (`http` or `https`).
- `DB_USER`: Username of CouchDB Admin (has access to create users and databases).
- `DB_PASS`: Password of CouchDB Admin.
- `DB_HOST`: Hostname of CouchDB Admin.
- `DB_PORT`: Port of CouchDB server (`5984`).
- `DB_REJECT_UNAUTHORIZED_SSL`: Boolean indicating if unauthorized SSL certificates should be rejected (`true` or `false`). Defaults to `false` for development testing. Must be `true` for production environments otherwise SSL certificates won't be verified.
DB_PUBLIC_USER: Alphanumeric string for a public database user. These credentials can be requested by anyone and provide access to all databases where the permissions have been set to `public`.
DB_PUBLIC_PASS: Alphanumeric string for a public database password.

## CouchDB configuration

### JWT

[Ensure `{chttpd_auth, jwt_authentication_handler}` is added to the list of the active `chttpd/authentication_handlers`](https://docs.couchdb.org/en/stable/api/server/authn.html?highlight=jwt#jwt-authentication)

```
[chttpd]

authentication_handlers = {chttpd_auth, jwt_authentication_handler}, {chttpd_auth, cookie_authentication_handler}, {chttpd_auth, default_authentication_handler}

[jwt_auth]
required_claims = exp

[jwt_keys]
hmac:_default = <base64 secret key>
```

Note: A secret key (string) can be base64 encoded with the following:

```
const secretKey = 'secretKey'
const encodedKey = new Buffer(secretKey).toString('base64')
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