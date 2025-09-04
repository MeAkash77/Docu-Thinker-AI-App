const redis = require("redis");

let redisClient;

const initializeRedis = async () => {
  try {
    if (!process.env.REDIS_URL) {
      throw new Error("❌ REDIS_URL not set in environment variables");
    }

    // Detect if REDIS_URL uses TLS (rediss://)
    const isTls = process.env.REDIS_URL.startsWith("rediss://");

    redisClient = redis.createClient({
      url: process.env.REDIS_URL,
      socket: isTls
        ? {
            tls: true,
            rejectUnauthorized: false, // allow self-signed certs
          }
        : {}, // no TLS for local redis://
    });

    // Attach event listeners
    redisClient.on("connect", () => {
      console.log("✅ Connected to Redis successfully!");
    });

    redisClient.on("error", (err) => {
      console.error("❌ Redis connection error:", err.message);
    });

    await redisClient.connect();

    // Test connection
    await redisClient.set("DocuThinker-Redis", "connected");
    console.log("✅ Successfully added test key in Redis: DocuThinker-Redis");

    // Add example keys
    await addExampleKeys();
  } catch (err) {
    console.error("❌ Failed to initialize Redis:", err.message);
  }
};

/**
 * Add example keys to Redis
 */
const addExampleKeys = async () => {
  try {
    // Example session data
    const exampleSession = {
      userId: "user123",
      token: "abcdef123456",
      loginTime: new Date().toISOString(),
    };
    await cacheUserSession(exampleSession.userId, exampleSession);

    // Example document metadata
    const exampleDocMetadata = {
      title: "AI Research Paper",
      author: "Jane Doe",
      createdAt: new Date().toISOString(),
      tags: ["AI", "Machine Learning", "Research"],
    };
    await cacheDocumentMetadata("doc123", exampleDocMetadata);

    // Example query results
    const exampleQueryResults = [
      { docId: "doc123", title: "AI Research Paper" },
      { docId: "doc456", title: "Blockchain Basics" },
    ];
    await cacheQueryResults("user123:search:AI", exampleQueryResults);

    // Example recently viewed documents
    await cacheRecentlyViewedDocument("user123", "doc123");
    await cacheRecentlyViewedDocument("user123", "doc456");

    console.log("ℹ️ Example keys added to Redis.");
  } catch (err) {
    console.error("❌ Error adding example keys:", err.message);
  }
};

// ---------------- Cache Utility Functions ----------------

/**
 * Cache user session data
 */
const cacheUserSession = async (userId, sessionData, ttl = 3600) => {
  try {
    const key = `user:session:${userId}`;
    await redisClient.set(key, JSON.stringify(sessionData), { EX: ttl });
    console.log(`Cached session for user ${userId}`);
  } catch (err) {
    console.error("Error caching user session:", err.message);
  }
};

/**
 * Cache document metadata
 */
const cacheDocumentMetadata = async (docId, metadata, ttl = 3600) => {
  try {
    const key = `document:metadata:${docId}`;
    await redisClient.set(key, JSON.stringify(metadata), { EX: ttl });
    console.log(`Cached metadata for document ${docId}`);
  } catch (err) {
    console.error("Error caching document metadata:", err.message);
  }
};

/**
 * Cache query results
 */
const cacheQueryResults = async (queryKey, results, ttl = 600) => {
  try {
    const key = `query:results:${queryKey}`;
    await redisClient.set(key, JSON.stringify(results), { EX: ttl });
    console.log(`Cached results for query ${queryKey}`);
  } catch (err) {
    console.error("Error caching query results:", err.message);
  }
};

/**
 * Cache recently viewed documents
 */
const cacheRecentlyViewedDocument = async (userId, docId, ttl = 3600) => {
  try {
    const key = `user:recently_viewed:${userId}`;
    await redisClient.lPush(key, docId);
    await redisClient.expire(key, ttl);
    console.log(`Cached recently viewed document ${docId} for user ${userId}`);
  } catch (err) {
    console.error("Error caching recently viewed document:", err.message);
  }
};

/**
 * Invalidate a specific cache key
 */
const invalidateCache = async (key) => {
  try {
    await redisClient.del(key);
    console.log(`Invalidated cache for key ${key}`);
  } catch (err) {
    console.error("Error invalidating cache:", err.message);
  }
};

/**
 * Fetch data from cache
 */
const fetchFromCache = async (key) => {
  try {
    const data = await redisClient.get(key);
    return data ? JSON.parse(data) : null;
  } catch (err) {
    console.error("Error fetching data from cache:", err.message);
    return null;
  }
};

module.exports = {
  redisClient,
  initializeRedis,
  cacheUserSession,
  cacheDocumentMetadata,
  cacheQueryResults,
  cacheRecentlyViewedDocument,
  invalidateCache,
  fetchFromCache,
};
