import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import Groq from "groq-sdk";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// 🔑 Use environment variable for Groq API key
const groq = new Groq({
  apiKey: process.env.GROQ_KEY,
});

app.use(cors());
app.use(bodyParser.json());

// Optional password protection
const PASSWORD = process.env.APP_PASSWORD; // set this in Render Env Variables if you want
app.use((req, res, next) => {
  if (PASSWORD) {
    const auth = req.headers.authorization || "";
    const token = auth.replace("Bearer ", "");
    if (token !== PASSWORD) {
      return res.status(401).send("Unauthorized: Invalid password");
    }
  }
  next();
});

// Serve frontend files
app.use(express.static(path.join(__dirname, "public")));

// Serve index.html on root
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Chat API
app.post("/chat", async (req, res) => {
  try {
    const userMsg = req.body.message;

    const completion = await groq.chat.completions.create({
      model: "llama-3.1-8b-instant",
      messages: [
        {
          role: "system",
          content: "You are Spark AI, expert in Math and Physics. Explain clearly."
        },
        {
          role: "user",
          content: userMsg
        }
      ],
    });

    const reply = completion.choices[0].message.content;
    res.json({ reply });

  } catch (err) {
    console.error(err);
    res.status(500).json({ reply: "❌ AI Error" });
  }
});

app.listen(PORT, () => {
  console.log(`✅ Spark AI running at http://localhost:${PORT}`);
});
