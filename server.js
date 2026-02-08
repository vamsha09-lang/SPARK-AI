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
// Fix __dirname (ESM)
// --------------------
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --------------------
// App init
// --------------------
const app = express();
const PORT = process.env.PORT || 3000;

// --------------------
// Middleware
// --------------------
app.use(cors());
app.use(bodyParser.json());

// --------------------
// Serve frontend correctly
// --------------------
app.use(express.static(path.join(__dirname, "public")));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// --------------------
// Groq setup
// --------------------
if (!process.env.GROQ_KEY) {
  console.error("❌ GROQ_KEY is missing in environment variables");
}

const groq = new Groq({
  apiKey: process.env.GROQ_KEY,
});

// --------------------
// Chat API
// --------------------
app.post("/chat", async (req, res) => {
  try {
    const userMsg = req.body.message;

    if (!userMsg) {
      return res.status(400).json({ reply: "Message is empty" });
    }

    const completion = await groq.chat.completions.create({
      model: "llama-3.1-8b-instant",
      messages: [
        { role: "system", content: "You are Spark AI, expert in Math and Physics. Explain clearly." },
        { role: "user", content: userMsg },
      ],
    });

    const reply = completion.choices[0]?.message?.content || "No reply";
    res.json({ reply });

  } catch (err) {
    console.error("Chat error:", err.message);
    res.status(500).json({ reply: "❌ AI Error" });
  }
});

// --------------------
// Start server
// --------------------
app.listen(PORT, () => {
  console.log(`✅ Spark AI running on port ${PORT}`);
});
