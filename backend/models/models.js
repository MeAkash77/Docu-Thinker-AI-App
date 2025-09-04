const firebaseAdmin = require("firebase-admin");
const firestore = firebaseAdmin.firestore();

/**
 * @swagger
 * components:
 *   schemas:
 *     User:
 *       type: object
 *       description: >
 *         Represents a user in Firestore. Each user has a unique Firebase UID,
 *         email, theme preferences, social media links, and a list of documents.
 *       properties:
 *         uid:
 *           type: string
 *           description: The unique Firebase user ID.
 *           example: "12345abcde"
 *         email:
 *           type: string
 *           description: The user's email address.
 *           example: "user@example.com"
 *         createdAt:
 *           type: string
 *           format: date-time
 *           description: Timestamp when the user was created.
 *           example: "2023-01-01T12:00:00Z"
 *         documents:
 *           type: array
 *           description: List of documents created by the user.
 *           items:
 *             $ref: '#/components/schemas/Document'
 *         theme:
 *           type: string
 *           description: User’s theme preference.
 *           example: "dark"
 *         socialMedia:
 *           type: object
 *           description: Social media links for the user.
 *           properties:
 *             github:
 *               type: string
 *               example: "https://github.com/example"
 *             linkedin:
 *               type: string
 *               example: "https://linkedin.com/in/example"
 *
 *     Document:
 *       type: object
 *       description: >
 *         Represents a user-created document. Each document includes metadata
 *         such as ID, title, and summary.
 *       properties:
 *         id:
 *           type: string
 *           description: Unique identifier for the document.
 *           example: "doc123"
 *         title:
 *           type: string
 *           description: Document title.
 *           example: "My First Document"
 *         summary:
 *           type: string
 *           description: A brief summary of the document.
 *           example: "This is a summary of my first document."
 */

/**
 * @swagger
 * tags:
 *   - name: Users
 *     description: API for managing users in Firestore.
 *   - name: Documents
 *     description: API for managing user documents in Firestore.
 *   - name: Audio
 *     description: API for processing audio files and transcription.
 *   - name: AI/Machine Learning
 *     description: API for generating insights from documents using AI.
 *   - name: Document Analysis
 *     description: API for advanced analysis on documents.
 *   - name: Document Refinement
 *     description: API for enhancing and refining document content.
 */

/**
 * User Model
 */
const User = {
  async create(uid, email, createdAt) {
    await firestore.collection("users").doc(uid).set({
      email,
      documents: [],
      createdAt,
      theme: "light",
      socialMedia: {},
    });
  },

  async getById(uid) {
    const userDoc = await firestore.collection("users").doc(uid).get();
    return userDoc.exists ? userDoc.data() : null;
  },

  async updateEmail(uid, newEmail) {
    await firestore.collection("users").doc(uid).update({ email: newEmail });
  },

  async updateTheme(uid, theme) {
    if (!["light", "dark"].includes(theme)) {
      throw new Error("Invalid theme. Must be 'light' or 'dark'.");
    }
    await firestore.collection("users").doc(uid).update({ theme });
  },

  async updateSocialMedia(uid, socialMedia) {
    await firestore.collection("users").doc(uid).update({ socialMedia });
  },

  async deleteAllDocuments(uid) {
    await firestore.collection("users").doc(uid).update({ documents: [] });
  },
};

/**
 * Document Model
 */
const Document = {
  async add(userId, doc) {
    await firestore.collection("users").doc(userId).update({
      documents: firebaseAdmin.firestore.FieldValue.arrayUnion(doc),
    });
  },

  async updateTitle(userId, docId, newTitle) {
    const userDoc = await firestore.collection("users").doc(userId).get();
    if (!userDoc.exists) throw new Error("User not found");

    const updatedDocs = userDoc
      .data()
      .documents.map((d) => (d.id === docId ? { ...d, title: newTitle } : d));

    await firestore.collection("users").doc(userId).update({
      documents: updatedDocs,
    });
  },

  async getById(userId, docId) {
    const userDoc = await firestore.collection("users").doc(userId).get();
    if (!userDoc.exists) throw new Error("User not found");

    return userDoc.data().documents.find((d) => d.id === docId) || null;
  },

  async delete(userId, docId) {
    const userDoc = await firestore.collection("users").doc(userId).get();
    if (!userDoc.exists) throw new Error("User not found");

    const updatedDocs = userDoc.data().documents.filter((d) => d.id !== docId);

    await firestore.collection("users").doc(userId).update({
      documents: updatedDocs,
    });
  },
};

module.exports = { User, Document };
