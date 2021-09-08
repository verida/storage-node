# Welcome to Verida Datastore Server

## Usage

```
$ npm install
$ npm run start
```

Note: You may need to update `.env` to point to the appropriate CERAMIC HTTP endpoint to use.

## Configuration

Edit `.env` to update the configuration:

- HASH_KEY: A unique hash key that is used as entropy when generating an alpha numeric username from a DID. Set this to a unique value when first running the server. DO NOT change this key once the server is up and running as you will end up with a mismatch of usernames. If you run multiple servers in front of a cluster of CouchDB instances, all servers must use the same `HASH_KEY`.
- CERAMIC_URL: URL of a Ceramic HTTP node. Currently defaults to the public testnet (`https://gateway-clay.ceramic.network`).
- DB_PROTOCOL: Protocol to use when connecting to CouchDB (`http` or `https`).
- DB_USER: Username of CouchDB Admin (has access to create users and databases).
- DB_PASS: Password of CouchDB Admin.
- DB_HOST: Hostname of CouchDB Admin.
- DB_PORT: Port of CouchDB server (`5984`).
- DB_REJECT_UNAUTHORIZED_SSL: Boolean indicating if unauthorized SSL certificates should be rejected (`true` or `false`). Defaults to `false` for development testing. Must be `true` for production environments otherwise SSL certificates won't be verified.
DB_PUBLIC_USER: Alphanumeric string for a public database user. These credentials can be requested by anyone and provide access to all databases where the permissions have been set to `public`.
DB_PUBLIC_PASS: Alphanumeric string for a public database password.

## About

This server acts as middleware between web applications built using the [Verida Datastore](http://www.github.com/verida/datastore) and the underlying databases storing user data.

Key features:

- Ensure all API requests come from verified on chain users (via user signed messages)
- Manage database users, linking them to valid on chain DID's
- Manage permissions for individual databases
- Add a second layer of security by managing per-database ACL validation rules
- Providing applications with user's database DSN's (including user credentials)