// server.js
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import Groq from "groq-sdk";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// -------- Middleware --------
app.use(cors());
app.use(express.json());

// -------- Check API key --------
if (!process.env.GROQ_KEY) {
  console.error("❌ GROQ_KEY is missing in environment variables");
}

// -------- Groq Client --------
const groq = new Groq({
  apiKey: process.env.GROQ_KEY,
});

// -------- Serve frontend --------
// Works EVEN IF index.html is in root
app.use(express.static(__dirname));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// -------- Chat API --------
app.post("/chat", async (req, res) => {
  try {
    const userMsg = req.body.message;

    if (!userMsg) {
      return res.status(400).json({ reply: "Message missing" });
    }

    const completion = await groq.chat.completions.create({
      model: "llama-3.1-8b-instant",
      messages: [
        {
          role: "system",
          content: "You are Spark AI. Answer clearly and simply.",
        },
        {
          role: "user",
          content: userMsg,
        },
      ],
    });

    res.json({
      reply: completion.choices[0].message.content,
    });

  } catch (err) {
    console.error("Chat error:", err);
    res.status(500).json({ reply: "❌ AI Error" });
  }
});

// -------- Start Server --------
app.listen(PORT, () => {
  console.log(`✅ Spark AI running on port ${PORT}`);
});
