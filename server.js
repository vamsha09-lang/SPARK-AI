import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import Groq from "groq-sdk";
import { GoogleGenerativeAI } from "@google/generative-ai";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import multer from "multer";
import pdfParse from "pdf-parse";
import mammoth from "mammoth";
import session from "express-session";
import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";

let uploadedContent = "";
const uploadedImages = {};

// ---------------- PATHS ----------------
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CHAT_FILE = path.join(__dirname, "chats.json");
const PROMPT_FILE = path.join(__dirname, "systemprompt.txt");

// ---------------- APP ----------------
const app = express();
app.set("trust proxy", 1);
const PORT = process.env.PORT || 3000;

// ---------------- GROQ ----------------
const groq = new Groq({ apiKey: process.env.GROQ_KEY });

// ---------------- GEMINI ----------------
if (!process.env.GEMINI_API_KEY) {
  console.error("❌ GEMINI_API_KEY missing");
}

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

// ---------------- MIDDLEWARE ----------------
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, "public")));
app.use(session({
  secret: process.env.SESSION_SECRET || "spark_secret",
  resave: false,
  saveUninitialized: false
}));
app.use(passport.initialize());
app.use(passport.session());

// ---------------- GOOGLE AUTH ----------------
passport.use(new GoogleStrategy({
  clientID: process.env.GOOGLE_CLIENT_ID || "",
  clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
  callbackURL: "https://spark-ai-hzaa.onrender.com/auth/google/callback"
}, (accessToken, refreshToken, profile, done) => done(null, profile)));

passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((user, done) => done(null, user));

app.get("/auth/google", passport.authenticate("google", { scope: ["profile", "email"] }));
app.get("/auth/google/callback",
  passport.authenticate("google", { failureRedirect: "/" }),
  (req, res) => res.redirect("/")
);

app.get("/auth/logout", (req, res) => {
  if (req.logout) {
    req.logout(() => res.redirect("/"));
  } else {
    res.redirect("/");
  }
});

app.get("/me", (req, res) => res.json(req.user || null));

// ---------------- FILE UPLOAD ----------------
const uploadDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);
app.use("/uploads", express.static(uploadDir));

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => cb(null, Date.now() + "-" + file.originalname)
});
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = [
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "text/plain",
      "image/jpeg",
      "image/png",
      "image/gif",
      "image/webp"
    ];
    cb(null, allowed.includes(file.mimetype));
  }
});

// ---------------- CHAT STORE ----------------
function readChats() {
  if (!fs.existsSync(CHAT_FILE)) return {};
  try {
    return JSON.parse(fs.readFileSync(CHAT_FILE, "utf8"));
  } catch {
    return {};
  }
}
function writeChats(data) {
  fs.writeFileSync(CHAT_FILE, JSON.stringify(data, null, 2));
}

// ---------------- SYSTEM PROMPT ----------------
const DEFAULT_PROMPT = "You are Spark AI, an expert assistant in Math, Physics, and general knowledge. Be clear, helpful and concise.";
function getSystemPrompt() {
  if (fs.existsSync(PROMPT_FILE)) {
    const c = fs.readFileSync(PROMPT_FILE, "utf8").trim();
    if (c) return c;
  }
  return DEFAULT_PROMPT;
}

function imageToGenerativePart(filePath, mimeType) {
  return {
    inlineData: {
      data: fs.readFileSync(filePath).toString("base64"),
      mimeType
    }
  };
}

function toStoredChatMessage(m) {
  return {
    role: m.role,
    content: m.text ?? m.content ?? "",
    ts: m.ts || Date.now(),
    ...(m.imageUrl ? { imageUrl: m.imageUrl } : {})
  };
}

function toClientChatMessage(m) {
  return {
    role: m.role,
    text: m.content ?? m.text ?? "",
    ts: m.ts || Date.now(),
    ...(m.imageUrl ? { imageUrl: m.imageUrl } : {})
  };
}

// ---------------- ROUTES ----------------
app.get("/", (req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));

app.get("/history", (req, res) => {
  if (!req.user) return res.status(401).json([]);
  const email = req.user.emails[0].value;
  const chats = readChats();
  res.json((chats[email] || []).map(toClientChatMessage));
});

app.get("/systemprompt", (req, res) => res.json({ prompt: getSystemPrompt() }));
app.post("/systemprompt", (req, res) => {
  const { prompt } = req.body;
  if (!prompt) return res.status(400).json({ error: "Invalid" });
  fs.writeFileSync(PROMPT_FILE, prompt.trim());
  res.json({ success: true });
});

// ── STREAMING CHAT ──
app.post("/chat/stream", async (req, res) => {
  try {
    if (!req.user) return res.status(401).end();
    const email = req.user.emails[0].value;
    const { message } = req.body;
    if (!message) return res.status(400).end();

    const chats = readChats();
    chats[email] = chats[email] || [];

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    // Vision path
    if (uploadedImages[email]) {
      const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
      const imageData = uploadedImages[email];

      const result = await model.generateContent([
        message,
        imageToGenerativePart(imageData.path, imageData.mime)
      ]);

      const visionReply = result.response.text();

      res.write(`data: ${JSON.stringify({ token: visionReply })}\n\n`);
      chats[email].push({ role: "user", content: `[Image Question] ${message}` });
      chats[email].push({ role: "assistant", content: visionReply });
      writeChats(chats);

      delete uploadedImages[email];
      res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
      res.end();
      return;
    }

    const finalMessage = uploadedContent
      ? `Document:\n\n${uploadedContent.substring(0, 3000)}\n\nUser question:\n${message}\n\nAnswer using the document if possible.`
      : message;

    chats[email].push({ role: "user", content: finalMessage });

    const stream = await groq.chat.completions.create({
      model: "llama-3.1-8b-instant",
      messages: [
        { role: "system", content: getSystemPrompt() },
        ...chats[email]
      ],
      stream: true
    });

    let fullReply = "";
    for await (const chunk of stream) {
      const token = chunk.choices[0]?.delta?.content || "";
      if (token) {
        fullReply += token;
        res.write(`data: ${JSON.stringify({ token })}\n\n`);
      }
    }

    chats[email].push({ role: "assistant", content: fullReply });
    writeChats(chats);
    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
  } catch (err) {
    console.error("Stream error:", err);
    if (!res.headersSent) {
      res.status(500);
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
    }
    res.write(`data: ${JSON.stringify({ error: "❌ AI Error: " + err.message })}\n\n`);
    res.end();
  }
});

// Non-streaming fallback
app.post("/chat", async (req, res) => {
  try {
    if (!req.user) return res.status(401).json({ reply: "Please login first." });
    const email = req.user.emails[0].value;
    const { message } = req.body;
    if (!message) return res.status(400).end();

    const chats = readChats();
    chats[email] = chats[email] || [];

    const finalMessage = uploadedContent
      ? `Document:\n\n${uploadedContent.substring(0, 3000)}\n\nUser question:\n${message}`
      : message;

    chats[email].push({ role: "user", content: finalMessage });

    const completion = await groq.chat.completions.create({
      model: "llama-3.1-8b-instant",
      messages: [{ role: "system", content: getSystemPrompt() }, ...chats[email]]
    });

    const reply = completion.choices[0].message.content;
    chats[email].push({ role: "assistant", content: reply });
    writeChats(chats);
    res.json({ reply });
  } catch (err) {
    console.error("Chat error:", err);
    res.status(500).json({ reply: "❌ AI Error: " + err.message });
  }
});

// Upload endpoint
app.post("/upload", upload.single("file"), async (req, res) => {
  try {
    uploadedContent = "";
    const file = req.file;
    if (!file) return res.json({ success: false });

    const isImage = file.mimetype.startsWith("image/");
    if (req.user && isImage) {
      uploadedContent = "";
      const email = req.user.emails[0].value;
      uploadedImages[email] = { path: file.path, mime: file.mimetype };
    }

    if (file.mimetype === "application/pdf") {
      const data = await pdfParse(fs.readFileSync(file.path));
      uploadedContent = data.text.substring(0, 4000);
    } else if (file.mimetype === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
      const result = await mammoth.extractRawText({ path: file.path });
      uploadedContent = result.value.substring(0, 4000);
    } else if (file.mimetype === "text/plain") {
      uploadedContent = fs.readFileSync(file.path, "utf8").substring(0, 4000);
    }

    res.json({
      success: true,
      filename: file.originalname,
      url: "/uploads/" + file.filename,
      isImage,
      mimetype: file.mimetype
    });
  } catch (err) {
    console.error(err);
    res.json({ success: false });
  }
});

app.listen(PORT, () => console.log(`✅ Spark AI running on port ${PORT}`));
