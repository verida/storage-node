# Welcome to Verida Storage Node Server

This server acts as middleware between web applications built using the [Verida Datastore](https://developers.verida.io/docs/concepts/data-storage/) and the underlying databases storing user data.

Key features:

- Ensuring all API requests come from verified Verida network users (via user signed messages)
- Managing database users, linking them to valid DID's
- Managing permissions for individual databases
- Adding a second layer of security by managing per-database ACL validation rules
- Providing applications with user's database connection strings

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

- `HASH_KEY`: A unique hash key that is used as entropy when generating an alpha numeric username from a DID. Set this to a unique value when first running the server. DO NOT change this key once the server is up and running as you will end up with a mismatch of usernames. If you run multiple servers in front of a cluster of CouchDB instances, all servers must use the same `HASH_KEY`.
- `DID_SERVER_URL`: URL of a Verida DID Server endpoint.
- `DB_PROTOCOL`: Protocol to use when connecting to CouchDB (`http` or `https`).
- `DB_USER`: Username of CouchDB Admin (has access to create users and databases).
- `DB_PASS`: Password of CouchDB Admin.
- `DB_HOST`: Hostname of CouchDB Admin.
- `DB_PORT`: Port of CouchDB server (`5984`).
- `DB_REJECT_UNAUTHORIZED_SSL`: Boolean indicating if unauthorized SSL certificates should be rejected (`true` or `false`). Defaults to `false` for development testing. Must be `true` for production environments otherwise SSL certificates won't be verified.
- `DB_PUBLIC_USER`: Alphanumeric string for a public database user. These credentials can be requested by anyone and provide access to all databases where the permissions have been set to `public`.
- `DB_PUBLIC_PASS`: Alphanumeric string for a public database password.

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

## Deployment


We use [Claudia.js](https://claudiajs.com/) to turn our Express app into an Express-on-Lambda app.

Before doing any Lambda deployments you **MUST** translate your `.env` file (or one for production) to JSON as `.env.prod.json`.
See the [Claudia Docs for information](https://claudiajs.com/news/2016/11/24/claudia-2.2.0-environment-vars.html).

A copy of `.env.prod.json` for this deployment is in BitWarden (name= "Storage Server .env.prod.json") but is **NOT** checked into Github. 

You will need your [`AWS_PROFILE` set](https://docs.aws.amazon.com/cli/latest/userguide/cli-configure-profiles.html). There are many ways to do this, but a simple one is:
```
export AWS_PROFILE=verida-prod
```

First time deployment can be done using:

```
yarn lambda-deploy
```

This does the following:

- Create the Lambda (in us-east-2)
- Create an (Edge) API Gateway pointing at it

For brand new deployments, you will need to setup CloudWatch logging manually.

- API Gateway ARN should be set to `arn:aws:iam::131554244047:role/APIGatewayLoggingRole` for the logging to work

Updates can be done using:

```
yarn lambda-update
```

This uploads a new version of the code to the existing lambda.

The command `yarn lambda-pack` exists to build a local zip file which can be helpful for debugging packaging issues.

