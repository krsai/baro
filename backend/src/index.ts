import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { PrismaClient } from ".prisma/client";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const prisma = new PrismaClient();

const DEFAULT_ORG = {
  name: "BARO",
  businessNumber: "",
  representative: "관리자",
  industry: "봉제",
  address: "",
  phone: "",
  email: "krsailer82@gmail.com",
  type: "MANUFACTURER",
};

const DEFAULT_ATTRIBUTES = {
  colors: [
    { code: "BLK", name: "Black" },
    { code: "WHT", name: "White" },
    { code: "RED", name: "Red" },
    { code: "BLU", name: "Blue" },
  ],
  sizes: [
    { code: "S", name: "Small" },
    { code: "M", name: "Medium" },
    { code: "L", name: "Large" },
    { code: "XL", name: "X-Large" },
  ],
  genders: [
    { code: "M", name: "Men" },
    { code: "W", name: "Women" },
    { code: "U", name: "Unisex" },
  ],
  categories: [
    { code: "OUT", name: "Outer" },
    { code: "TOP", name: "Top" },
    { code: "BTM", name: "Bottom" },
    { code: "DRS", name: "Dress" },
    { code: "ACC", name: "Accessory" },
  ],
  roles: [
    { code: "ADMIN", name: "관리자" },
    { code: "MGR", name: "공장장" },
    { code: "WORKER", name: "작업자" },
  ],
  processes: [
    { code: "P01", name: "주머니 달기" },
    { code: "P02", name: "소매 달기" },
    { code: "P03", name: "단추 달기" },
    { code: "P04", name: "지퍼 달기" },
    { code: "P05", name: "라벨 부착" },
  ],
};

const isNumericId = (value) => {
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value === "string") return /^\d+$/.test(value);
  return false;
};

const toId = (value) => Number(value);
const normalizeEmail = (value) => {
  if (typeof value !== "string") return "";
  return value.trim().toLowerCase();
};

const getPrimaryOrganization = async () => {
  let organization = await prisma.organization.findFirst({
    orderBy: { id: "asc" },
  });

  if (!organization) {
    organization = await prisma.organization.create({ data: DEFAULT_ORG });
  }

  return organization;
};

const seedAttributesIfEmpty = async (orgId) => {
  const [
    colorCount,
    sizeCount,
    genderCount,
    categoryCount,
    roleCount,
    processCount,
  ] = await Promise.all([
    prisma.attrColor.count({ where: { orgId } }),
    prisma.attrSize.count({ where: { orgId } }),
    prisma.attrGender.count({ where: { orgId } }),
    prisma.attrCategory.count({ where: { orgId } }),
    prisma.attrRole.count({ where: { orgId } }),
    prisma.attrProcess.count({ where: { orgId } }),
  ]);

  const actions = [];
  if (colorCount === 0) {
    actions.push(
      prisma.attrColor.createMany({
        data: DEFAULT_ATTRIBUTES.colors.map((item) => ({ ...item, orgId })),
      })
    );
  }
  if (sizeCount === 0) {
    actions.push(
      prisma.attrSize.createMany({
        data: DEFAULT_ATTRIBUTES.sizes.map((item) => ({ ...item, orgId })),
      })
    );
  }
  if (genderCount === 0) {
    actions.push(
      prisma.attrGender.createMany({
        data: DEFAULT_ATTRIBUTES.genders.map((item) => ({ ...item, orgId })),
      })
    );
  }
  if (categoryCount === 0) {
    actions.push(
      prisma.attrCategory.createMany({
        data: DEFAULT_ATTRIBUTES.categories.map((item) => ({ ...item, orgId })),
      })
    );
  }
  if (roleCount === 0) {
    actions.push(
      prisma.attrRole.createMany({
        data: DEFAULT_ATTRIBUTES.roles.map((item) => ({ ...item, orgId })),
      })
    );
  }
  if (processCount === 0) {
    actions.push(
      prisma.attrProcess.createMany({
        data: DEFAULT_ATTRIBUTES.processes.map((item) => ({ ...item, orgId })),
      })
    );
  }

  if (actions.length > 0) {
    await prisma.$transaction(actions);
  }
};

const syncSection = async (model, orgId, items) => {
  const safeItems = Array.isArray(items) ? items : [];
  const incomingIds = safeItems
    .filter((item) => isNumericId(item.id))
    .map((item) => toId(item.id));

  const deleteWhere =
    incomingIds.length > 0
      ? { orgId, id: { notIn: incomingIds } }
      : { orgId };

  await model.deleteMany({ where: deleteWhere });

  const creates = [];
  const updates = [];

  for (const item of safeItems) {
    const code = (item.code ?? "").trim();
    const name = (item.name ?? "").trim();

    if (!code && !name) {
      continue;
    }

    if (isNumericId(item.id)) {
      updates.push(
        model.update({
          where: { id: toId(item.id) },
          data: { code, name },
        })
      );
    } else {
      creates.push({ orgId, code, name });
    }
  }

  if (creates.length > 0) {
    await model.createMany({ data: creates });
  }

  if (updates.length > 0) {
    await prisma.$transaction(updates);
  }

  return model.findMany({ where: { orgId }, orderBy: { id: "asc" } });
};

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
  const organization = await getPrimaryOrganization();
  res.json(organization);
});

app.get("/organization-users", async (req, res) => {
  const orgId = Number(req.query.orgId);
  const where = Number.isFinite(orgId) ? { orgId } : {};
  const users = await prisma.organizationUser.findMany({
    where,
    orderBy: { id: "asc" },
  });
  res.json(users);
});

app.get("/attributes", async (_req, res) => {
  const organization = await getPrimaryOrganization();
  await seedAttributesIfEmpty(organization.id);

  const [colors, sizes, genders, categories, roles, processes] =
    await Promise.all([
      prisma.attrColor.findMany({
        where: { orgId: organization.id },
        orderBy: { id: "asc" },
      }),
      prisma.attrSize.findMany({
        where: { orgId: organization.id },
        orderBy: { id: "asc" },
      }),
      prisma.attrGender.findMany({
        where: { orgId: organization.id },
        orderBy: { id: "asc" },
      }),
      prisma.attrCategory.findMany({
        where: { orgId: organization.id },
        orderBy: { id: "asc" },
      }),
      prisma.attrRole.findMany({
        where: { orgId: organization.id },
        orderBy: { id: "asc" },
      }),
      prisma.attrProcess.findMany({
        where: { orgId: organization.id },
        orderBy: { id: "asc" },
      }),
    ]);

  res.json({
    colors,
    sizes,
    genders,
    categories,
    roles,
    processes,
  });
});

app.put("/attributes", async (req, res) => {
  const organization = await getPrimaryOrganization();
  const payload = req.body ?? {};

  const tasks = [];
  const response = {};

  if (payload.colors) {
    tasks.push(
      syncSection(prisma.attrColor, organization.id, payload.colors).then(
        (data) => {
          response.colors = data;
        }
      )
    );
  }
  if (payload.sizes) {
    tasks.push(
      syncSection(prisma.attrSize, organization.id, payload.sizes).then(
        (data) => {
          response.sizes = data;
        }
      )
    );
  }
  if (payload.genders) {
    tasks.push(
      syncSection(prisma.attrGender, organization.id, payload.genders).then(
        (data) => {
          response.genders = data;
        }
      )
    );
  }
  if (payload.categories) {
    tasks.push(
      syncSection(prisma.attrCategory, organization.id, payload.categories).then(
        (data) => {
          response.categories = data;
        }
      )
    );
  }
  if (payload.roles) {
    tasks.push(
      syncSection(prisma.attrRole, organization.id, payload.roles).then(
        (data) => {
          response.roles = data;
        }
      )
    );
  }
  if (payload.processes) {
    tasks.push(
      syncSection(prisma.attrProcess, organization.id, payload.processes).then(
        (data) => {
          response.processes = data;
        }
      )
    );
  }

  await Promise.all(tasks);

  res.json(response);
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

app.post("/organization-users", async (req, res) => {
  const { orgId, email, role } = req.body ?? {};
  const orgIdNum = Number(orgId);
  const normalizedEmail = normalizeEmail(email);

  if (!Number.isFinite(orgIdNum)) {
    return res.status(400).json({ ok: false, error: "orgId is required" });
  }

  if (!normalizedEmail || !normalizedEmail.includes("@")) {
    return res.status(400).json({ ok: false, error: "email is required" });
  }

  const organization = await prisma.organization.findUnique({
    where: { id: orgIdNum },
  });

  if (!organization) {
    return res.status(404).json({ ok: false, error: "organization not found" });
  }

  const allowedRoles = new Set(["OWNER", "OPERATOR", "MEMBER"]);
  const safeRole = allowedRoles.has(role) ? role : "OPERATOR";

  const record = await prisma.organizationUser.upsert({
    where: { orgId_email: { orgId: orgIdNum, email: normalizedEmail } },
    update: { role: safeRole },
    create: { orgId: orgIdNum, email: normalizedEmail, role: safeRole },
  });

  res.status(201).json(record);
});

const port = process.env.PORT || 4000;
app.listen(port, () => {
  console.log(`API running on http://localhost:${port}`);
});
