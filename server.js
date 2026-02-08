// server.js
import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import Groq from "groq-sdk";
import path from "path";
import { fileURLToPath } from "url";

// --------------------
// Path setup (IMPORTANT for Render)
// --------------------
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --------------------
// App init
// --------------------
const app = express();
const PORT = process.env.PORT || 3000;

// --------------------
// Groq client
// --------------------
const groq = new Groq({
  apiKey: process.env.GROQ_KEY
});

// --------------------
// Middleware
// --------------------
app.use(cors());
app.use(bodyParser.json());

// --------------------
// Serve frontend (PUBLIC FIRST)
// --------------------
app.use(express.static(path.join(__dirname, "public")));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// --------------------
// Chat password protection (ONLY for /chat)
// --------------------
const PASSWORD = process.env.APP_PASSWORD; // optional

const protectChat = (req, res, next) => {
  if (!PASSWORD) return next();

  const auth = req.headers.authorization || "";
  const token = auth.replace("Bearer ", "");

  if (token !== PASSWORD) {
    return res.status(401).json({ reply: "🔒 Invalid password" });
  }
  next();
};

// --------------------
// Chat API
// --------------------
app.post("/chat", protectChat, async (req, res) => {
  try {
    const userMsg = req.body.message;

    const completion = await groq.chat.completions.create({
      model: "llama-3.1-8b-instant", // excellent for math & physics
      messages: [
        {
          role: "system",
          content: "You are Spark AI, expert in Math and Physics. Explain clearly step by step."
        },
        {
          role: "user",
          content: userMsg
        }
      ]
    });

    const reply = completion.choices[0].message.content;
    res.json({ reply });

  } catch (err) {
    console.error("Chat error:", err);
    res.status(500).json({ reply: "❌ AI Error" });
  }
});

// --------------------
// Start server
// --------------------
app.listen(PORT, () => {
  console.log(`✅ Spark AI running on port ${PORT}`);
});
