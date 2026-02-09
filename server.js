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

    chats[user].push({ role: "user", content: message });

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

// ---------------- START ----------------
app.listen(PORT, () => {
  console.log(`✅ Spark AI running on port ${PORT}`);
});
