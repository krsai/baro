import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { PrismaClient } from ".prisma/client";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const prisma = new PrismaClient();

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.get("/health/db", async (_req, res) => {
  try {
    const count = await prisma.ping.count();
    res.json({ ok: true, pingCount: count });
  } catch (_error) {
    res.status(500).json({ ok: false, error: "DB connection failed" });
  }
});

const port = process.env.PORT || 4000;
app.listen(port, () => {
  console.log(`API running on http://localhost:${port}`);
});
