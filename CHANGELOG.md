2023-08-22 (2.2.0)
--------------------

Breaking changes:

- `.env` `DID_NETWORK` renamed to `VERIDA_NETWORK`. Represents the Verida network (ie: `myrtle`) this node is operating on.
- Some environment variables have moved out of `.env` and are now hard coded as protocol variables. See `src/config.js`

Other changes:

- Refactor to process replication entries differently depending on those that are missing, broken or need touching (update expiry)
- Log the full replication identifier when replication entry fails to update
- Improve insert / update error logging

2023-02-15 (2.1.0)
--------------------

- Redesign how replication works (initiated when a user connects and remains active for 20 minutes, instead of always replicate everything)

2023-01-13 (2.0.0)
--------------------

- Support blockchain DID registry
- Support refresh and access tokens
- Support server side replication, including cehcks and recovery
- Support device disconnections
- Support maintaining database of context specific databases to enable monitoring of usage
- Support database deletion
- Support create, update, retreive and delete DID documents
- Support `/lookup/did` endpoint to provide a DID document caching service
- Remove lambda support
- Support docker containers


2021-09-17 (1.2.0)
--------------------

- Refactor: Use Ceramic for DID's
- Feature: Additional unit tests relating to user permissions
- Feature: Make Ceramic URL configurable
- Feature: Improve documentation
- Feature: Cache DID responses and Ceramic connection
- Feature: Switch to yarn

2021-03-18 (1.1.1)
--------------------

- Update `@verida/did-helper` to fix issues with NEAR signatures from implicit accounts


2021-03-17 (1.1.0)
--------------------

- Update `@verida/did-helper` to support NEAR