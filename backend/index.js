// backend/index.js
// DocuThinker - robust backend entry with safe /upload route
// NOTE: backup your existing file before replacing.

const path = require("path");
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const multer = require("multer");
require("dotenv").config();

const swaggerDocs = require("./swagger/swagger");
const { initializeRedis } = require("./redis/redisClient");
const { graphqlHTTP } = require("express-graphql");
const { makeExecutableSchema } = require("@graphql-tools/schema");
const typeDefs = require("./graphql/schema");
const resolvers = require("./graphql/resolvers");

// Attempt to import controllers - if uploadDocument is missing we'll use a fallback
let controllers = {};
try {
  controllers = require("./controllers/controllers");
} catch (err) {
  console.warn("Could not load controllers/controllers.js - using fallback stubs.", err?.message || err);
}

const {
  registerUser,
  loginUser,
  uploadDocument,
  generateKeyIdeas,
  generateDiscussionPoints,
  chatWithAI,
  forgotPassword,
  verifyEmail,
  getAllDocuments,
  getDocumentById,
  getDocumentDetails,
  deleteAllDocuments,
  deleteDocument,
  getDaysSinceJoined,
  getDocumentCount,
  updateUserEmail,
  updateUserPassword,
  getUserEmail,
  updateDocumentTitle,
  getUserJoinedDate,
  updateTheme,
  updateSocialMedia,
  getSocialMedia,
  sentimentAnalysis,
  actionableRecommendations,
  summaryInLanguage,
  bulletSummary,
  contentRewriting,
  searchDocuments,
  processAudioFile,
  refineSummary,
} = controllers || {};

const app = express();

/**
 * Middleware
 */
// Accept large JSON payloads (some summaries / text can be large)
app.use(express.json({ limit: "20mb" }));
app.use(express.urlencoded({ extended: true, limit: "20mb" }));

// Helmet CSP tuned for Google + Drive + common services (tighten for prod)
app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        "default-src": ["'self'"],
        "script-src": [
          "'self'",
          "'unsafe-inline'",
          "'unsafe-eval'",
          "https://apis.google.com",
          "https://www.gstatic.com",
          "https://accounts.google.com",
          "https://www.googletagmanager.com",
        ],
        "connect-src": [
          "'self'",
          "https://accounts.google.com",
          "https://www.googleapis.com",
          "https://content.googleapis.com",
          "https://oauth2.googleapis.com",
          "https://*.googleapis.com",
        ],
        "frame-src": ["'self'", "https://accounts.google.com", "https://www.google.com", "https://www.gstatic.com"],
        "img-src": ["'self'", "data:", "blob:", "https://www.gstatic.com", "https://lh3.googleusercontent.com", "https://*.googleusercontent.com"],
        "style-src": ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        "font-src": ["'self'", "https://fonts.gstatic.com"],
      },
    },
  })
);

// CORS - allow localhost dev origins; tighten in production
const corsOptions = {
  origin: (origin, callback) => {
    if (!origin) return callback(null, true); // allow curl/postman
    const allowed = [
      "http://localhost:3000",
      "http://127.0.0.1:3000",
      "http://localhost:3001",
      "http://127.0.0.1:3001",
      "http://localhost:5000",
    ];
    if (allowed.includes(origin) || process.env.NODE_ENV !== "production") return callback(null, true);
    return callback(new Error("Not allowed by CORS"), false);
  },
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With", "Accept"],
  credentials: true,
};
app.use(cors(corsOptions));

// Serve public static (favicon, any worker file you host)
app.use(express.static(path.join(__dirname, "public")));

// Initialize Redis but don't crash server if Redis fails
initializeRedis().catch((err) => {
  console.warn("Redis init warning (continuing):", err?.message || err);
});

// GraphQL (safe init)
try {
  const schema = makeExecutableSchema({ typeDefs, resolvers });
  app.use("/graphql", graphqlHTTP({ schema, graphiql: true }));
} catch (err) {
  console.warn("GraphQL initialization failed:", err?.message || err);
}

// Swagger UI + JSON
app.get("/swagger.json", (req, res) => res.json(swaggerDocs));
app.get("/api-docs", (req, res) => {
  res.send(`
    <!doctype html>
    <html>
      <head><meta charset="utf-8"/><title>DocuThinker API Docs</title>
      <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist/swagger-ui.css" />
      </head>
      <body>
        <div id="swagger-ui"></div>
        <script src="https://unpkg.com/swagger-ui-dist/swagger-ui-bundle.js"></script>
        <script src="https://unpkg.com/swagger-ui-dist/swagger-ui-standalone-preset.js"></script>
        <script>
          window.onload = function() {
            SwaggerUIBundle({ url: '/swagger.json', dom_id: '#swagger-ui', presets: [SwaggerUIBundle.presets.apis, SwaggerUIStandalonePreset], layout: "StandaloneLayout" });
          };
        </script>
      </body>
    </html>
  `);
});

// Redirect root to api docs
app.get("/", (req, res) => res.redirect("/api-docs"));

// Simple request logger
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
  next();
});

/**
 * Multer setup for file uploads (stores files in memory for processing)
 * - Use memoryStorage so we can process buffer directly (no disk writes required)
 * - If you prefer disk storage, switch to diskStorage with destination/filename
 */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB
});

/**
 * Routes
 */
// Basic auth endpoints (no-op if controllers missing)
if (typeof registerUser === "function") app.post("/register", registerUser);
if (typeof loginUser === "function") app.post("/login", loginUser);

/**
 * Robust /upload route:
 * - Accepts multipart/form-data with field "file" (file in req.file)
 * - Accepts application/json with body { title, text, userId }
 * - If controllers.uploadDocument exists, it will be called directly and receive the same req/res.
 * - Otherwise returns a simple test summary so frontend can continue.
 */
app.post("/upload", upload.single("file"), async (req, res) => {
  try {
    // If you have a controller, let it handle the request (preserves project logic)
    if (typeof uploadDocument === "function") {
      return uploadDocument(req, res);
    }

    // Fallback behavior for local dev/test: handle both file and JSON payloads

    // If there's a file (multipart)
    if (req.file) {
      const { originalname, mimetype, size, buffer } = req.file;

      // Basic validation example
      if (!mimetype) return res.status(400).json({ error: "Uploaded file missing mimetype" });
      // We'll not parse PDF/DOCX here (keep fallback lightweight).
      // Return metadata + fake summary for dev:
      const fakeSummary = `Fallback summary for "${originalname}". File type: ${mimetype}, size: ${size} bytes.`;
      return res.json({ summary: fakeSummary, originalText: "", title: originalname });
    }

    // If JSON body with extracted text
    const { title, text, userId } = req.body || {};
    if (text && title) {
      // naive fallback summary: first 200 chars + sentence
      const snippet = String(text).slice(0, 200);
      const summary = `${snippet}${text.length > 200 ? "…" : ""}`;
      return res.json({ summary, originalText: text, title, userId });
    }

    // Nothing provided
    return res.status(400).json({ error: "No file or text provided in request. Send multipart/form-data (file) or JSON {title,text}." });
  } catch (err) {
    console.error("Upload route error:", err);
    return res.status(500).json({ error: err.message || "Upload error" });
  }
});

// Other AI / utility endpoints - register only if controller exists, otherwise skip
if (typeof generateKeyIdeas === "function") app.post("/generate-key-ideas", generateKeyIdeas);
if (typeof generateDiscussionPoints === "function") app.post("/generate-discussion-points", generateDiscussionPoints);
if (typeof chatWithAI === "function") app.post("/chat", chatWithAI);
if (typeof forgotPassword === "function") app.post("/forgot-password", forgotPassword);
if (typeof verifyEmail === "function") app.post("/verify-email", verifyEmail);

if (typeof getAllDocuments === "function") app.get("/documents/:userId", getAllDocuments);
if (typeof getDocumentById === "function") app.get("/documents/:userId/:docId", getDocumentById);
if (typeof getDocumentDetails === "function") app.get("/document-details/:userId/:docId", getDocumentDetails);
if (typeof deleteDocument === "function") app.delete("/documents/:userId/:docId", deleteDocument);
if (typeof deleteAllDocuments === "function") app.delete("/documents/:userId", deleteAllDocuments);

if (typeof updateUserEmail === "function") app.post("/update-email", updateUserEmail);
if (typeof updateUserPassword === "function") app.post("/update-password", updateUserPassword);
if (typeof getDaysSinceJoined === "function") app.get("/days-since-joined/:userId", getDaysSinceJoined);
if (typeof getDocumentCount === "function") app.get("/document-count/:userId", getDocumentCount);
if (typeof getUserEmail === "function") app.get("/users/:userId", getUserEmail);
if (typeof updateDocumentTitle === "function") app.post("/update-document-title", updateDocumentTitle);
if (typeof getUserJoinedDate === "function") app.get("/user-joined-date/:userId", getUserJoinedDate);
if (typeof updateTheme === "function") app.put("/update-theme", updateTheme);
if (typeof getSocialMedia === "function") app.get("/social-media/:userId", getSocialMedia);
if (typeof updateSocialMedia === "function") app.post("/update-social-media", updateSocialMedia);
if (typeof sentimentAnalysis === "function") app.post("/sentiment-analysis", sentimentAnalysis);
if (typeof actionableRecommendations === "function") app.post("/actionable-recommendations", actionableRecommendations);
if (typeof summaryInLanguage === "function") app.post("/summary-in-language", summaryInLanguage);
if (typeof bulletSummary === "function") app.post("/bullet-summary", bulletSummary);
if (typeof contentRewriting === "function") app.post("/content-rewriting", contentRewriting);
if (typeof searchDocuments === "function") app.get("/search-documents/:userId", searchDocuments);
if (typeof processAudioFile === "function") app.post("/process-audio", processAudioFile);
if (typeof refineSummary === "function") app.post("/refine-summary", refineSummary);

/**
 * 404 & error handlers
 * Place 404 handler after routes so valid routes are matched first
 */
app.use((req, res) => {
  res.status(404).json({ error: "Route not found", path: req.originalUrl });
});

// centralized error handler
app.use((err, req, res, next) => {
  console.error("Global error handler:", err && err.stack ? err.stack : err);
  if (res.headersSent) return next(err);
  const status = err.status || 500;
  res.status(status).json({
    error: err.message || "Internal Server Error",
    details: process.env.NODE_ENV === "production" ? undefined : err.stack,
  });
});

// Start server
const port = parseInt(process.env.PORT, 10) || 5000;
if (process.env.NODE_ENV !== "production") {
  app.listen(port, "0.0.0.0", () => {
    console.log(`DocuThinker backend listening on http://localhost:${port}`);
  });
} else {
  // On many hosts you export app instead of directly listening
  console.log("DocuThinker backend configured for production (app exported).");
}

module.exports = app;
