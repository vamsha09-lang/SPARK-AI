// server.js
import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import Groq from "groq-sdk";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import multer from "multer";
import pdfParse from "pdf-parse";
import mammoth from "mammoth";
let uploadedContent = "";

// ---------------- PATHS ----------------
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CHAT_FILE = path.join(__dirname, "chats.json");

// ---------------- APP ----------------
const app = express();
const PORT = process.env.PORT || 3000;

// ---------------- GROQ ----------------
const groq = new Groq({
  apiKey: process.env.GROQ_KEY
});

// ---------------- MIDDLEWARE ----------------
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, "public")));
// ---------------- FILE UPLOAD ----------------

const uploadDir = path.join(__dirname, "uploads");

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir);
}

app.use("/uploads", express.static(uploadDir));

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + "-" + file.originalname);
  }
});

const upload = multer({ storage });

// ---------------- LOAD CHAT FILE ----------------
function readChats() {
  if (!fs.existsSync(CHAT_FILE)) return {};
  return JSON.parse(fs.readFileSync(CHAT_FILE, "utf8"));
}

function writeChats(data) {
  fs.writeFileSync(CHAT_FILE, JSON.stringify(data, null, 2));
}

// ---------------- ROUTES ----------------

// Serve app
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Load history for user
app.get("/history/:user", (req, res) => {
  const chats = readChats();
  res.json(chats[req.params.user] || []);
});

// Chat endpoint
app.post("/chat", async (req, res) => {
  try {
    const { user, message } = req.body;
    if (!user || !message) return res.status(400).end();

    const chats = readChats();
    chats[user] = chats[user] || [];

 const finalMessage =
uploadedContent
? `Document:

${uploadedContent}

Question:
${message}`
: message;

chats[user].push({
  role: "user",
  content: finalMessage
});

    const completion = await groq.chat.completions.create({
      model: "llama-3.1-8b-instant",
      messages: [
        { role: "system", content: "You are Spark AI, expert in Math and Physics." },
        ...chats[user]
      ]
    });

    const reply = completion.choices[0].message.content;

    chats[user].push({ role: "assistant", content: reply });
    writeChats(chats);

    res.json({ reply });

  } catch (err) {
    console.error("Chat error:", err);
    res.status(500).json({ reply: "❌ AI Error" });
  }
});
// Upload endpoint
app.post("/upload", upload.single("file"), async (req, res) => {

  try {

    uploadedContent = "";

    const file = req.file;

    if (!file) {
      return res.json({ success: false });
    }

    // PDF
    if (file.mimetype === "application/pdf") {

      const data = await pdfParse(
        fs.readFileSync(file.path)
      );

      uploadedContent = data.text;
    }

    // DOCX
    else if (
      file.mimetype ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    ) {

      const result = await mammoth.extractRawText({
        path: file.path
      });

      uploadedContent = result.value;
    }

    // TXT
    else if (file.mimetype === "text/plain") {

      uploadedContent =
        fs.readFileSync(file.path, "utf8");
    }

    res.json({
      success: true,
      filename: file.originalname
    });

  } catch (err) {

    console.log(err);

    res.json({
      success: false
    });

  }

});

// ---------------- START ----------------
app.listen(PORT, () => {
  console.log(`✅ Spark AI running on port ${PORT}`);
});
