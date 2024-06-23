export default {
    DID_CACHE_DURATION: 3600,
    // 10 Minutes
    ACCESS_TOKEN_EXPIRY: 600,
    // 30 Days
    REFRESH_TOKEN_EXPIRY: 2592000,
    DB_REFRESH_TOKENS: 'verida_refresh_tokens',
    // How often garbage collection runs (1=100%, 0.5 = 50%)
    GC_PERCENT: 0.1,
    // Default maximum number of Megabytes for a storage context
    DEFAULT_USER_CONTEXT_LIMIT_MB: 10,
    // How many minutes before the replication expires on an open database
    // Should be 2x ACCESS_TOKEN_EXPIRY
    REPLICATION_EXPIRY_MINUTES: 20,
    DB_DIDS: 'verida_dids',
    DB_REPLICATER_CREDS: 'verida_replicater_creds'
}