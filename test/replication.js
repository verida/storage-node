

/**
 * Config:
 * 1. admin credentials for endpoint1 and endpoint2
 * 
 * Steps:
 * 
 * 1. Create a new VDA private key
 * 2. Create new DID document (using DIDClient) for the private key with two testing endpoints (local)
 * 3. Create three test databases (db1, db2, db3) via `createDatabase()`
 * 4. Call `checkReplication(db1)` on endpoint1, then endpoint2
 * 5. Verify the data is being replicated for db1, but not db2 (create 3 records on endpoint1, verify its on endpoint2, create 3 records on d2, verify not on endpoint2)
 * 6. Call `checkReplication()` on endpoint1, then endpoint2
 * 7. Verify the data is being replicated for db2 and db3
 * 8. Delete db1
 * 9. Call `checkReplication()` on endpoint1, endpoint2
 * 10. Verify replication entry is removed from both, Verify database is deleted from both
 */