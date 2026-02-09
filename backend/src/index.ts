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

app.get("/organizations", async (_req, res) => {
  const organizations = await prisma.organization.findMany({
    orderBy: { id: "asc" },
  });
  res.json(organizations);
});

app.get("/organizations/primary", async (_req, res) => {
  const organization = await prisma.organization.findFirst({
    orderBy: { id: "asc" },
  });

  if (organization) {
    return res.json(organization);
  }

  const seeded = await prisma.organization.create({
    data: {
      name: "BARO",
      businessNumber: "",
      representative: "관리자",
      industry: "봉제",
      address: "",
      phone: "",
      email: "krsailer82@gmail.com",
      type: "MANUFACTURER",
    },
  });

  res.json(seeded);
});

app.post("/organizations", async (req, res) => {
  const {
    name,
    businessNumber,
    representative,
    industry,
    address,
    phone,
    email,
    type,
  } = req.body ?? {};

  if (!name || typeof name !== "string") {
    return res.status(400).json({ ok: false, error: "name is required" });
  }

  const organization = await prisma.organization.create({
    data: {
      name,
      businessNumber,
      representative,
      industry,
      address,
      phone,
      email,
      type,
    },
  });

  res.status(201).json(organization);
});

app.put("/organizations/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    return res.status(400).json({ ok: false, error: "invalid id" });
  }

  const {
    name,
    businessNumber,
    representative,
    industry,
    address,
    phone,
    email,
    type,
  } = req.body ?? {};

  const organization = await prisma.organization.update({
    where: { id },
    data: {
      name,
      businessNumber,
      representative,
      industry,
      address,
      phone,
      email,
      type,
    },
  });

  res.json(organization);
});

const port = process.env.PORT || 4000;
app.listen(port, () => {
  console.log(`API running on http://localhost:${port}`);
});
