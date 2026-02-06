import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import Groq from "groq-sdk";

const app = express();
const PORT = 3000;

// 🔑 PASTE YOUR GROQ API KEY HERE
const GROQ_API_KEY = process.env.GROQ_KEY
 ;

const groq = new Groq({
  apiKey: GROQ_API_KEY
});

app.use(cors());
app.use(bodyParser.json());
app.use(express.static("public"));

// Chat API
app.post("/chat", async (req, res) => {
  try {
    const userMsg = req.body.message;

    const completion = await groq.chat.completions.create({
    model: "llama-3.1-8b-instant",

 // very good for math/physics
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

