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
const normalizeOrgCode = (value) => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().toUpperCase();
  return trimmed === "" ? null : trimmed;
};
const isValidOrgCode = (value) => /^[A-Z]{4}$/.test(value);
const toNumberOrNull = (value) => {
  if (value === "" || value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};
const resolveOptionalString = (value, fallback = null) => {
  if (value === undefined) return fallback;
  if (value === null) return null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed === "" ? null : trimmed;
  }
  return fallback;
};
const ROLE_OPTIONS = new Set(["ADMIN", "OPERATOR", "ACCOUNTANT", "WORKER"]);
const MEMBERSHIP_STATUSES = new Set([
  "PENDING",
  "ACTIVE",
  "REJECTED",
  "SUSPENDED",
  "TERMINATED",
]);
const resolveRole = (value, fallback = "WORKER") =>
  ROLE_OPTIONS.has(value) ? value : fallback;
const resolveStatus = (value) =>
  MEMBERSHIP_STATUSES.has(value) ? value : null;
const isManufacturerOrg = (org) => org?.type === "MANUFACTURER";
const isBrandOrg = (org) => org?.type === "BRAND";

const getPrimaryOrganization = async () => {
  let organization = await prisma.organization.findFirst({
    orderBy: { id: "asc" },
  });

  if (!organization) {
    organization = await prisma.organization.create({ data: DEFAULT_ORG });
  }

  return organization;
};

const getOrganizationByQuery = async (req) => {
  const orgId = Number(req.query.orgId);
  if (Number.isFinite(orgId)) {
    return prisma.organization.findUnique({ where: { id: orgId } });
  }
  return getPrimaryOrganization();
};

const toCustomerResponse = (relationship) => {
  const brand = relationship.brand ?? {};
  const brandCode = brand.code ?? relationship.customerCode ?? "";
  return {
    id: relationship.id,
    brandOrgId: relationship.brandOrgId,
    code: brandCode,
    name: brand.name ?? "",
    manager: relationship.managerName ?? brand.representative ?? "",
    phone: relationship.managerPhone ?? brand.phone ?? "",
    email: relationship.managerEmail ?? brand.email ?? "",
    registeredAt: relationship.createdAt,
    brand,
  };
};

const createStyleId = () =>
  `S-${Date.now().toString(36).toUpperCase()}-${Math.random()
    .toString(36)
    .slice(2, 6)
    .toUpperCase()}`;

const ensureArray = (value) => (Array.isArray(value) ? value : []);
const toStyleIdentityKey = (customer, value) =>
  `${(customer ?? "").trim()}::${(value ?? "").trim()}`;

const normalizeStylePayload = (payload, fallbackStyleId = null) => {
  const rawId = typeof payload?.id === "string" ? payload.id.trim() : "";
  const styleId = rawId || fallbackStyleId || createStyleId();
  const name = typeof payload?.name === "string" ? payload.name.trim() : "";
  const customer =
    typeof payload?.customer === "string" ? payload.customer.trim() : "";
  const styleCodeInput = resolveOptionalString(payload?.styleCode, null);
  const styleCode = styleCodeInput ?? name;

  return {
    styleId,
    styleCode,
    name,
    customer,
    registrationDate: resolveOptionalString(payload?.registrationDate, null),
    designer: resolveOptionalString(payload?.designer, null),
    collection: resolveOptionalString(payload?.collection, null),
    season: resolveOptionalString(payload?.season, null),
    imageUrls: ensureArray(payload?.imageUrls),
    processes: ensureArray(payload?.processes),
    bom: ensureArray(payload?.bom),
    bomNotes: resolveOptionalString(payload?.bomNotes, null),
  };
};

const findStyleConflict = async ({
  orgId,
  customer,
  name,
  styleCode,
  excludeUid = null,
}) => {
  const conflict = await prisma.style.findFirst({
    where: {
      orgId,
      customer,
      ...(Number.isFinite(excludeUid) ? { NOT: { uid: excludeUid } } : {}),
      OR: [{ name }, { styleCode }],
    },
    select: { uid: true, name: true, styleCode: true },
  });
  if (!conflict) return null;
  if (conflict.name === name) {
    return "style name already exists for this customer";
  }
  if (conflict.styleCode === styleCode) {
    return "style code already exists for this customer";
  }
  return "style already exists for this customer";
};

const toStyleResponse = (style) => ({
  id: style.styleId,
  styleCode: style.styleCode ?? "",
  name: style.name ?? "",
  customer: style.customer ?? "",
  registrationDate: style.registrationDate ?? "",
  designer: style.designer ?? "",
  collection: style.collection ?? "",
  season: style.season ?? "",
  imageUrls: ensureArray(style.imageUrls),
  processes: ensureArray(style.processes),
  bom: ensureArray(style.bom),
  bomNotes: style.bomNotes ?? "",
  createdAt: style.createdAt,
  updatedAt: style.updatedAt,
});

const closeActiveLineAssignments = async (employeeId, endedAt = new Date()) => {
  const activeAssignments = await prisma.lineAssignment.findMany({
    where: { employeeId, endAt: null },
    select: { lineId: true },
  });

  if (activeAssignments.length === 0) {
    return [];
  }

  const lineIds = activeAssignments.map((item) => item.lineId);
  await prisma.lineAssignment.updateMany({
    where: { employeeId, endAt: null },
    data: { endAt: endedAt },
  });

  await prisma.line.updateMany({
    where: { id: { in: lineIds }, managerEmployeeId: employeeId },
    data: { managerEmployeeId: null },
  });

  return lineIds;
};

const seedAttributesIfEmpty = async (orgId) => {
  const [colorCount, categoryCount, roleCount, processCount] =
    await Promise.all([
    prisma.attrColor.count({ where: { orgId } }),
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

const listOrgMemberships = async (req, res) => {
  const orgId = Number(req.query.orgId);
  const status = resolveStatus(req.query.status);
  const email = normalizeEmail(req.query.email);
  const where = {
    ...(Number.isFinite(orgId) ? { orgId } : {}),
    ...(status ? { status } : {}),
    ...(email ? { email } : {}),
  };
  const members = await prisma.orgMembership.findMany({
    where,
    orderBy: { id: "asc" },
  });
  res.json(members);
};

app.get("/org-memberships", listOrgMemberships);

app.post("/org-memberships/apply", async (req, res) => {
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

  const safeRole = resolveRole(role, "WORKER");
  const existing = await prisma.orgMembership.findUnique({
    where: { orgId_email: { orgId: orgIdNum, email: normalizedEmail } },
  });

  if (existing) {
    if (existing.status === "ACTIVE") {
      return res.json(existing);
    }

    const updated = await prisma.orgMembership.update({
      where: { id: existing.id },
      data: {
        role: safeRole,
        status: "PENDING",
        requestedAt: new Date(),
        approvedAt: null,
        approvedBy: null,
      },
    });
    return res.json(updated);
  }

  const record = await prisma.orgMembership.create({
    data: {
      orgId: orgIdNum,
      email: normalizedEmail,
      role: safeRole,
      status: "PENDING",
      requestedAt: new Date(),
    },
  });

  res.status(201).json(record);
});

app.patch("/org-memberships/:id/approve", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    return res.status(400).json({ ok: false, error: "invalid id" });
  }

  const { role, approvedBy, factoryId, employeeRoleId } = req.body ?? {};
  const normalizedApprovedBy = normalizeEmail(approvedBy);

  const membership = await prisma.orgMembership.findUnique({
    where: { id },
    include: { organization: true },
  });

  if (!membership) {
    return res.status(404).json({ ok: false, error: "membership not found" });
  }

  const nextRole = resolveRole(role, membership.role);
  let factoryIdNum = null;
  if (factoryId !== "" && factoryId !== null && factoryId !== undefined) {
    const parsedFactoryId = Number(factoryId);
    if (!Number.isFinite(parsedFactoryId)) {
      return res.status(400).json({ ok: false, error: "invalid factoryId" });
    }
    factoryIdNum = parsedFactoryId;
  }
  let employeeRoleIdNum = null;
  if (employeeRoleId !== "" && employeeRoleId !== null && employeeRoleId !== undefined) {
    const parsedRoleId = Number(employeeRoleId);
    if (!Number.isFinite(parsedRoleId)) {
      return res.status(400).json({ ok: false, error: "invalid employeeRoleId" });
    }
    employeeRoleIdNum = parsedRoleId;
  }
  if (!isManufacturerOrg(membership.organization) && factoryIdNum) {
    return res
      .status(400)
      .json({ ok: false, error: "brand organizations have no factories" });
  }
  if (isManufacturerOrg(membership.organization) && factoryIdNum) {
    const factory = await prisma.factory.findFirst({
      where: { id: factoryIdNum, orgId: membership.orgId },
    });
    if (!factory) {
      return res.status(404).json({ ok: false, error: "factory not found" });
    }
  }
  if (employeeRoleIdNum) {
    const attrRole = await prisma.attrRole.findFirst({
      where: { id: employeeRoleIdNum, orgId: membership.orgId },
    });
    if (!attrRole) {
      return res.status(404).json({ ok: false, error: "role not found" });
    }
  }
  const updated = await prisma.orgMembership.update({
    where: { id },
    data: {
      role: nextRole,
      status: "ACTIVE",
      approvedAt: new Date(),
      approvedBy: normalizedApprovedBy || membership.approvedBy || null,
    },
  });

  if (isManufacturerOrg(membership.organization)) {
    const now = new Date();
    const existingEmployee = await prisma.employee.findUnique({
      where: { orgMembershipId: membership.id },
    });
    await prisma.employee.upsert({
      where: { orgMembershipId: membership.id },
      update: {
        orgId: membership.orgId,
        factoryId: factoryIdNum,
        roleId: employeeRoleIdNum,
        joinedAt: existingEmployee?.joinedAt ?? now,
        leftAt: null,
        leaveStartAt: null,
        leaveEndAt: null,
      },
      create: {
        orgId: membership.orgId,
        orgMembershipId: membership.id,
        factoryId: factoryIdNum,
        roleId: employeeRoleIdNum,
        joinedAt: now,
      },
    });
  }

  res.json(updated);
});

app.patch("/org-memberships/:id/reject", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    return res.status(400).json({ ok: false, error: "invalid id" });
  }

  const { approvedBy } = req.body ?? {};
  const normalizedApprovedBy = normalizeEmail(approvedBy);

  const membership = await prisma.orgMembership.findUnique({
    where: { id },
    include: { organization: true },
  });

  if (!membership) {
    return res.status(404).json({ ok: false, error: "membership not found" });
  }

  await prisma.employee.deleteMany({
    where: { orgMembershipId: membership.id },
  });

  await prisma.orgMembership.delete({
    where: { id },
  });

  res.json({ ok: true });
});

app.patch("/org-memberships/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    return res.status(400).json({ ok: false, error: "invalid id" });
  }

  const { role, status, approvedBy } = req.body ?? {};
  const normalizedApprovedBy = normalizeEmail(approvedBy);

  if (role === undefined && status === undefined) {
    return res
      .status(400)
      .json({ ok: false, error: "role or status is required" });
  }

  const membership = await prisma.orgMembership.findUnique({
    where: { id },
    include: { organization: true },
  });

  if (!membership) {
    return res.status(404).json({ ok: false, error: "membership not found" });
  }

  const nextRole = role ? resolveRole(role, membership.role) : membership.role;
  const nextStatus = status ? resolveStatus(status) : null;
  if (status && !nextStatus) {
    return res.status(400).json({ ok: false, error: "invalid status" });
  }

  const data = {
    role: nextRole,
    status: nextStatus ?? membership.status,
  };

  if (nextStatus && nextStatus !== membership.status) {
    data.approvedBy = normalizedApprovedBy || membership.approvedBy || null;
    if (nextStatus === "ACTIVE") {
      data.approvedAt = membership.approvedAt || new Date();
    }
  }

  const updated = await prisma.orgMembership.update({
    where: { id },
    data,
  });

  if (isManufacturerOrg(membership.organization)) {
    const now = new Date();
    const existingEmployee = await prisma.employee.findUnique({
      where: { orgMembershipId: membership.id },
    });

    const currentStatus = data.status ?? membership.status;
    const employeeData = {
      orgId: membership.orgId,
    };

    if (currentStatus === "ACTIVE") {
      employeeData.joinedAt = existingEmployee?.joinedAt ?? now;
      if (membership.status === "SUSPENDED") {
        employeeData.leaveEndAt = now;
      }
      employeeData.leftAt = null;
    } else if (currentStatus === "SUSPENDED") {
      employeeData.leaveStartAt = existingEmployee?.leaveStartAt ?? now;
      employeeData.leaveEndAt = null;
      employeeData.leftAt = null;
    } else if (currentStatus === "TERMINATED") {
      employeeData.leftAt = now;
    }

    const upsertedEmployee = await prisma.employee.upsert({
      where: { orgMembershipId: membership.id },
      update: employeeData,
      create: {
        orgId: membership.orgId,
        orgMembershipId: membership.id,
        joinedAt: existingEmployee?.joinedAt ?? now,
        ...employeeData,
      },
    });

    if (currentStatus !== "ACTIVE") {
      await closeActiveLineAssignments(upsertedEmployee.id, now);
    }
  }

  res.json(updated);
});

app.get("/employees", async (req, res) => {
  const orgId = Number(req.query.orgId);
  const factoryId = Number(req.query.factoryId);
  const where = {
    ...(Number.isFinite(orgId) ? { orgId } : {}),
    ...(Number.isFinite(factoryId) ? { factoryId } : {}),
  };
  const employees = await prisma.employee.findMany({
    where,
    orderBy: { id: "asc" },
  });
  res.json(employees);
});

app.post("/employees", async (req, res) => {
  const {
    orgMembershipId,
    factoryId,
    lineName,
    position,
    roleId,
    name,
    bankName,
    bankAccountNumber,
  } = req.body ?? {};
  const orgMembershipIdNum = Number(orgMembershipId);

  if (!Number.isFinite(orgMembershipIdNum)) {
    return res
      .status(400)
      .json({ ok: false, error: "orgMembershipId is required" });
  }

  const membership = await prisma.orgMembership.findUnique({
    where: { id: orgMembershipIdNum },
    include: { organization: true },
  });

  if (!membership) {
    return res.status(404).json({ ok: false, error: "membership not found" });
  }

  if (membership.status !== "ACTIVE") {
    return res
      .status(400)
      .json({ ok: false, error: "membership is not active" });
  }

  let factoryIdNum = null;
  if (factoryId !== "" && factoryId !== null && factoryId !== undefined) {
    const parsedFactoryId = Number(factoryId);
    if (!Number.isFinite(parsedFactoryId)) {
      return res.status(400).json({ ok: false, error: "invalid factoryId" });
    }
    factoryIdNum = parsedFactoryId;
  }

  if (!isManufacturerOrg(membership.organization) && factoryIdNum) {
    return res
      .status(400)
      .json({ ok: false, error: "brand organizations have no factories" });
  }

  if (isManufacturerOrg(membership.organization) && factoryIdNum) {
    const factory = await prisma.factory.findFirst({
      where: { id: factoryIdNum, orgId: membership.orgId },
    });
    if (!factory) {
      return res.status(404).json({ ok: false, error: "factory not found" });
    }
  }

  let roleIdNum = null;
  if (roleId !== "" && roleId !== null && roleId !== undefined) {
    const parsedRoleId = Number(roleId);
    if (!Number.isFinite(parsedRoleId)) {
      return res.status(400).json({ ok: false, error: "invalid roleId" });
    }
    const attrRole = await prisma.attrRole.findFirst({
      where: { id: parsedRoleId, orgId: membership.orgId },
    });
    if (!attrRole) {
      return res.status(404).json({ ok: false, error: "role not found" });
    }
    roleIdNum = parsedRoleId;
  }

  const existingEmployee = await prisma.employee.findUnique({
    where: { orgMembershipId: membership.id },
  });
  const resolvedFactoryId = isManufacturerOrg(membership.organization)
    ? factoryIdNum !== null && factoryIdNum !== undefined
      ? factoryIdNum
      : existingEmployee?.factoryId ?? null
    : null;
  const resolvedRoleId =
    roleIdNum !== null && roleIdNum !== undefined
      ? roleIdNum
      : existingEmployee?.roleId ?? null;

  const data = {
    orgId: membership.orgId,
    orgMembershipId: membership.id,
    factoryId: resolvedFactoryId,
    roleId: resolvedRoleId,
    name: resolveOptionalString(name, existingEmployee?.name ?? null),
    bankName: resolveOptionalString(bankName, existingEmployee?.bankName ?? null),
    bankAccountNumber: resolveOptionalString(
      bankAccountNumber,
      existingEmployee?.bankAccountNumber ?? null
    ),
    lineName: resolveOptionalString(lineName, existingEmployee?.lineName ?? null),
    position: resolveOptionalString(position, existingEmployee?.position ?? null),
  };

  const employee = await prisma.employee.upsert({
    where: { orgMembershipId: membership.id },
    update: data,
    create: data,
  });

  res.json(employee);
});

app.get("/factories", async (req, res) => {
  const orgId = Number(req.query.orgId);
  const organization = Number.isFinite(orgId)
    ? await prisma.organization.findUnique({ where: { id: orgId } })
    : await getPrimaryOrganization();

  if (!organization) {
    return res.status(404).json({ ok: false, error: "organization not found" });
  }

  const factories = await prisma.factory.findMany({
    where: { orgId: organization.id },
    orderBy: { id: "asc" },
  });
  res.json(factories);
});

app.post("/factories", async (req, res) => {
  const organization = await getPrimaryOrganization();
  if (!isManufacturerOrg(organization)) {
    return res
      .status(400)
      .json({ ok: false, error: "brand organizations have no factories" });
  }
  const {
    name,
    address,
    countryCode,
    phoneNumber,
    manager,
    wageStandard,
    targetMonthlyWage,
    wagePerSecond,
  } = req.body ?? {};

  if (!name || typeof name !== "string") {
    return res.status(400).json({ ok: false, error: "name is required" });
  }

  const factory = await prisma.factory.create({
    data: {
      orgId: organization.id,
      name: name.trim(),
      address: address?.trim?.() ?? address ?? null,
      countryCode: countryCode?.trim?.() ?? countryCode ?? null,
      phoneNumber: phoneNumber?.trim?.() ?? phoneNumber ?? null,
      manager: manager?.trim?.() ?? manager ?? null,
      wageStandard: wageStandard || "PT",
      targetMonthlyWage: toNumberOrNull(targetMonthlyWage),
      wagePerSecond: toNumberOrNull(wagePerSecond),
    },
  });

  res.status(201).json(factory);
});

app.put("/factories/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    return res.status(400).json({ ok: false, error: "invalid id" });
  }

  const organization = await getPrimaryOrganization();
  if (!isManufacturerOrg(organization)) {
    return res
      .status(400)
      .json({ ok: false, error: "brand organizations have no factories" });
  }
  const existing = await prisma.factory.findFirst({
    where: { id, orgId: organization.id },
  });

  if (!existing) {
    return res.status(404).json({ ok: false, error: "factory not found" });
  }

  const {
    name,
    address,
    countryCode,
    phoneNumber,
    manager,
    wageStandard,
    targetMonthlyWage,
    wagePerSecond,
  } = req.body ?? {};

  const factory = await prisma.factory.update({
    where: { id },
    data: {
      name: typeof name === "string" ? name.trim() : existing.name,
      address: address?.trim?.() ?? address ?? null,
      countryCode: countryCode?.trim?.() ?? countryCode ?? null,
      phoneNumber: phoneNumber?.trim?.() ?? phoneNumber ?? null,
      manager: manager?.trim?.() ?? manager ?? null,
      wageStandard: wageStandard || existing.wageStandard,
      targetMonthlyWage: toNumberOrNull(targetMonthlyWage),
      wagePerSecond: toNumberOrNull(wagePerSecond),
    },
  });

  res.json(factory);
});

app.get("/lines", async (req, res) => {
  const organization = await getOrganizationByQuery(req);
  if (!organization) {
    return res.status(404).json({ ok: false, error: "organization not found" });
  }

  if (!isManufacturerOrg(organization)) {
    return res
      .status(400)
      .json({ ok: false, error: "brand organizations have no lines" });
  }

  const factoryId = Number(req.query.factoryId);
  if (!Number.isFinite(factoryId)) {
    return res.status(400).json({ ok: false, error: "factoryId is required" });
  }

  const factory = await prisma.factory.findFirst({
    where: { id: factoryId, orgId: organization.id },
  });
  if (!factory) {
    return res.status(404).json({ ok: false, error: "factory not found" });
  }

  const lines = await prisma.line.findMany({
    where: { orgId: organization.id, factoryId },
    orderBy: { id: "asc" },
  });

  res.json(lines);
});

app.post("/lines", async (req, res) => {
  const organization = await getPrimaryOrganization();
  if (!isManufacturerOrg(organization)) {
    return res
      .status(400)
      .json({ ok: false, error: "brand organizations have no lines" });
  }

  const { factoryId, name } = req.body ?? {};
  const factoryIdNum = Number(factoryId);
  if (!Number.isFinite(factoryIdNum)) {
    return res.status(400).json({ ok: false, error: "factoryId is required" });
  }

  const trimmedName = typeof name === "string" ? name.trim() : "";
  if (!trimmedName) {
    return res.status(400).json({ ok: false, error: "name is required" });
  }

  const factory = await prisma.factory.findFirst({
    where: { id: factoryIdNum, orgId: organization.id },
  });
  if (!factory) {
    return res.status(404).json({ ok: false, error: "factory not found" });
  }

  const existingLine = await prisma.line.findFirst({
    where: { factoryId: factoryIdNum, orgId: organization.id, name: trimmedName },
  });
  if (existingLine) {
    return res.status(409).json({ ok: false, error: "line already exists" });
  }

  const line = await prisma.line.create({
    data: {
      orgId: organization.id,
      factoryId: factoryIdNum,
      name: trimmedName,
    },
  });

  res.status(201).json(line);
});

app.patch("/lines/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    return res.status(400).json({ ok: false, error: "invalid id" });
  }

  const organization = await getPrimaryOrganization();
  if (!isManufacturerOrg(organization)) {
    return res
      .status(400)
      .json({ ok: false, error: "brand organizations have no lines" });
  }

  const existing = await prisma.line.findFirst({
    where: { id, orgId: organization.id },
  });
  if (!existing) {
    return res.status(404).json({ ok: false, error: "line not found" });
  }

  const { name, isActive, managerEmployeeId } = req.body ?? {};
  const data = {};

  if (typeof name === "string") {
    const trimmedName = name.trim();
    if (!trimmedName) {
      return res.status(400).json({ ok: false, error: "name is required" });
    }
    const nameConflict = await prisma.line.findFirst({
      where: {
        factoryId: existing.factoryId,
        orgId: organization.id,
        name: trimmedName,
        NOT: { id: existing.id },
      },
    });
    if (nameConflict) {
      return res.status(409).json({ ok: false, error: "line already exists" });
    }
    data.name = trimmedName;
  }

  if (isActive !== undefined) {
    data.isActive = Boolean(isActive);
  }

  if (managerEmployeeId !== undefined) {
    if (managerEmployeeId === null || managerEmployeeId === "") {
      data.managerEmployeeId = null;
    } else {
      const managerIdNum = Number(managerEmployeeId);
      if (!Number.isFinite(managerIdNum)) {
        return res
          .status(400)
          .json({ ok: false, error: "invalid managerEmployeeId" });
      }

      const manager = await prisma.employee.findFirst({
        where: {
          id: managerIdNum,
          orgId: organization.id,
          factoryId: existing.factoryId,
          membership: { role: "WORKER", status: "ACTIVE" },
        },
        include: { membership: true },
      });
      if (!manager) {
        return res
          .status(404)
          .json({ ok: false, error: "manager not found" });
      }

      const activeAssignment = await prisma.lineAssignment.findFirst({
        where: { lineId: existing.id, employeeId: manager.id, endAt: null },
      });
      if (!activeAssignment) {
        return res.status(400).json({
          ok: false,
          error: "manager must be assigned to the line first",
        });
      }

      data.managerEmployeeId = manager.id;
    }
  }

  if (Object.keys(data).length === 0) {
    return res.status(400).json({ ok: false, error: "no changes provided" });
  }

  const updated = await prisma.line.update({
    where: { id: existing.id },
    data,
  });

  res.json(updated);
});

app.get("/line-workers", async (req, res) => {
  const organization = await getOrganizationByQuery(req);
  if (!organization) {
    return res.status(404).json({ ok: false, error: "organization not found" });
  }

  if (!isManufacturerOrg(organization)) {
    return res
      .status(400)
      .json({ ok: false, error: "brand organizations have no lines" });
  }

  const factoryId = Number(req.query.factoryId);
  if (!Number.isFinite(factoryId)) {
    return res.status(400).json({ ok: false, error: "factoryId is required" });
  }

  const factory = await prisma.factory.findFirst({
    where: { id: factoryId, orgId: organization.id },
  });
  if (!factory) {
    return res.status(404).json({ ok: false, error: "factory not found" });
  }

  const workers = await prisma.employee.findMany({
    where: {
      orgId: organization.id,
      factoryId,
      membership: { role: "WORKER", status: "ACTIVE" },
    },
    include: { membership: true },
    orderBy: { id: "asc" },
  });

  const assignments = await prisma.lineAssignment.findMany({
    where: { line: { factoryId, orgId: organization.id }, endAt: null },
    select: { employeeId: true, lineId: true },
  });

  const assignmentByEmployee = new Map();
  assignments.forEach((assignment) => {
    assignmentByEmployee.set(assignment.employeeId, assignment.lineId);
  });

  res.json(
    workers.map((worker) => ({
      id: worker.id,
      orgMembershipId: worker.orgMembershipId,
      name: worker.name,
      email: worker.membership?.email ?? "",
      factoryId: worker.factoryId,
      currentLineId: assignmentByEmployee.get(worker.id) ?? null,
    }))
  );
});

app.post("/line-assignments/assign", async (req, res) => {
  const organization = await getPrimaryOrganization();
  if (!isManufacturerOrg(organization)) {
    return res
      .status(400)
      .json({ ok: false, error: "brand organizations have no lines" });
  }

  const { lineId, employeeId } = req.body ?? {};
  const lineIdNum = Number(lineId);
  const employeeIdNum = Number(employeeId);
  if (!Number.isFinite(lineIdNum) || !Number.isFinite(employeeIdNum)) {
    return res.status(400).json({
      ok: false,
      error: "lineId and employeeId are required",
    });
  }

  const line = await prisma.line.findFirst({
    where: { id: lineIdNum, orgId: organization.id },
  });
  if (!line) {
    return res.status(404).json({ ok: false, error: "line not found" });
  }

  const employee = await prisma.employee.findFirst({
    where: {
      id: employeeIdNum,
      orgId: organization.id,
      factoryId: line.factoryId,
      membership: { role: "WORKER", status: "ACTIVE" },
    },
    include: { membership: true },
  });
  if (!employee) {
    return res.status(404).json({ ok: false, error: "worker not found" });
  }

  const now = new Date();
  await closeActiveLineAssignments(employee.id, now);

  const assignment = await prisma.lineAssignment.create({
    data: {
      lineId: line.id,
      employeeId: employee.id,
      startAt: now,
    },
  });

  res.status(201).json(assignment);
});

app.post("/line-assignments/unassign", async (req, res) => {
  const organization = await getPrimaryOrganization();
  if (!isManufacturerOrg(organization)) {
    return res
      .status(400)
      .json({ ok: false, error: "brand organizations have no lines" });
  }

  const { employeeId } = req.body ?? {};
  const employeeIdNum = Number(employeeId);
  if (!Number.isFinite(employeeIdNum)) {
    return res
      .status(400)
      .json({ ok: false, error: "employeeId is required" });
  }

  const employee = await prisma.employee.findFirst({
    where: { id: employeeIdNum, orgId: organization.id },
  });
  if (!employee) {
    return res.status(404).json({ ok: false, error: "worker not found" });
  }

  await closeActiveLineAssignments(employee.id, new Date());

  res.json({ ok: true });
});

app.get("/customers", async (req, res) => {
  const organization = await getOrganizationByQuery(req);
  if (!organization) {
    return res.status(404).json({ ok: false, error: "organization not found" });
  }

  if (!isManufacturerOrg(organization)) {
    return res.status(400).json({
      ok: false,
      error: "only manufacturer organizations can manage customers",
    });
  }

  const relationships = await prisma.orgRelationship.findMany({
    where: { manufacturerOrgId: organization.id },
    include: { brand: true },
    orderBy: { id: "asc" },
  });

  res.json(relationships.map(toCustomerResponse));
});

app.post("/customers", async (req, res) => {
  const organization = await getPrimaryOrganization();
  if (!isManufacturerOrg(organization)) {
    return res.status(400).json({
      ok: false,
      error: "only manufacturer organizations can manage customers",
    });
  }

  const {
    brandOrgId,
    name,
    code,
    manager,
    phone,
    email,
    memo,
  } = req.body ?? {};
  const normalizedCode = normalizeOrgCode(code);
  if (!normalizedCode || !isValidOrgCode(normalizedCode)) {
    return res.status(400).json({
      ok: false,
      error: "code must be 4 uppercase letters",
    });
  }

  let brand = null;
  const brandOrgIdNum = Number(brandOrgId);
  if (Number.isFinite(brandOrgIdNum)) {
    brand = await prisma.organization.findUnique({
      where: { id: brandOrgIdNum },
    });
    if (!brand) {
      return res.status(404).json({ ok: false, error: "brand not found" });
    }

    const existingCodeOwner = await prisma.organization.findFirst({
      where: {
        code: normalizedCode,
        NOT: { id: brand.id },
      },
    });
    if (existingCodeOwner) {
      return res.status(409).json({ ok: false, error: "code already exists" });
    }

    if (brand.code !== normalizedCode) {
      await prisma.organization.update({
        where: { id: brand.id },
        data: { code: normalizedCode },
      });
    }
  } else {
    const trimmedName = typeof name === "string" ? name.trim() : "";
    if (!trimmedName) {
      return res.status(400).json({ ok: false, error: "name is required" });
    }

    const existingCodeOwner = await prisma.organization.findFirst({
      where: { code: normalizedCode },
    });
    if (existingCodeOwner) {
      return res.status(409).json({ ok: false, error: "code already exists" });
    }

    brand = await prisma.organization.create({
      data: {
        name: trimmedName,
        code: normalizedCode,
        type: "BRAND",
      },
    });
  }

  if (!isBrandOrg(brand)) {
    return res.status(400).json({ ok: false, error: "invalid brand type" });
  }

  if (brand.id === organization.id) {
    return res.status(400).json({
      ok: false,
      error: "cannot link organization to itself",
    });
  }

  const relationship = await prisma.orgRelationship.upsert({
    where: {
      manufacturerOrgId_brandOrgId: {
        manufacturerOrgId: organization.id,
        brandOrgId: brand.id,
      },
    },
    update: {
      customerCode: normalizedCode,
      managerName: resolveOptionalString(manager, null),
      managerPhone: resolveOptionalString(phone, null),
      managerEmail: resolveOptionalString(email, null),
      memo: resolveOptionalString(memo, null),
    },
    create: {
      manufacturerOrgId: organization.id,
      brandOrgId: brand.id,
      customerCode: normalizedCode,
      managerName: resolveOptionalString(manager, null),
      managerPhone: resolveOptionalString(phone, null),
      managerEmail: resolveOptionalString(email, null),
      memo: resolveOptionalString(memo, null),
    },
    include: { brand: true },
  });

  res.status(201).json(toCustomerResponse(relationship));
});

app.put("/customers/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    return res.status(400).json({ ok: false, error: "invalid id" });
  }

  const organization = await getPrimaryOrganization();
  if (!isManufacturerOrg(organization)) {
    return res.status(400).json({
      ok: false,
      error: "only manufacturer organizations can manage customers",
    });
  }

  const existing = await prisma.orgRelationship.findFirst({
    where: { id, manufacturerOrgId: organization.id },
    include: { brand: true },
  });

  if (!existing) {
    return res.status(404).json({ ok: false, error: "customer not found" });
  }

  const { name, code, manager, phone, email, memo } = req.body ?? {};
  const normalizedCode =
    code !== undefined ? normalizeOrgCode(code) : undefined;

  if (name !== undefined) {
    if (typeof name !== "string" || !name.trim()) {
      return res.status(400).json({ ok: false, error: "name is required" });
    }
  }

  if (code !== undefined) {
    if (!normalizedCode || !isValidOrgCode(normalizedCode)) {
      return res.status(400).json({
        ok: false,
        error: "code must be 4 uppercase letters",
      });
    }

    const existingCodeOwner = await prisma.organization.findFirst({
      where: {
        code: normalizedCode,
        NOT: { id: existing.brandOrgId },
      },
    });
    if (existingCodeOwner) {
      return res.status(409).json({ ok: false, error: "code already exists" });
    }
  }

  if (name !== undefined) {
    await prisma.organization.update({
      where: { id: existing.brandOrgId },
      data: { name: name.trim() },
    });
  }

  if (code !== undefined && normalizedCode) {
    await prisma.organization.update({
      where: { id: existing.brandOrgId },
      data: { code: normalizedCode },
    });
  }

  await prisma.orgRelationship.update({
    where: { id: existing.id },
    data: {
      customerCode:
        code !== undefined ? normalizedCode : existing.customerCode,
      managerName: resolveOptionalString(manager, existing.managerName),
      managerPhone: resolveOptionalString(phone, existing.managerPhone),
      managerEmail: resolveOptionalString(email, existing.managerEmail),
      memo: resolveOptionalString(memo, existing.memo),
    },
  });

  const refreshed = await prisma.orgRelationship.findUnique({
    where: { id: existing.id },
    include: { brand: true },
  });

  res.json(toCustomerResponse(refreshed));
});

app.get("/styles", async (req, res) => {
  const organization = await getOrganizationByQuery(req);
  if (!organization) {
    return res.status(404).json({ ok: false, error: "organization not found" });
  }

  const styles = await prisma.style.findMany({
    where: { orgId: organization.id },
    orderBy: { uid: "asc" },
  });

  res.json(styles.map(toStyleResponse));
});

app.get("/styles/:styleId", async (req, res) => {
  const organization = await getOrganizationByQuery(req);
  if (!organization) {
    return res.status(404).json({ ok: false, error: "organization not found" });
  }

  const styleId = (req.params.styleId ?? "").trim();
  if (!styleId) {
    return res.status(400).json({ ok: false, error: "styleId is required" });
  }

  const style = await prisma.style.findFirst({
    where: { orgId: organization.id, styleId },
  });
  if (!style) {
    return res.status(404).json({ ok: false, error: "style not found" });
  }

  res.json(toStyleResponse(style));
});

app.post("/styles", async (req, res) => {
  const organization = await getOrganizationByQuery(req);
  if (!organization) {
    return res.status(404).json({ ok: false, error: "organization not found" });
  }

  const payload = normalizeStylePayload(req.body ?? {});
  if (!payload.name) {
    return res.status(400).json({ ok: false, error: "name is required" });
  }
  if (!payload.customer) {
    return res.status(400).json({ ok: false, error: "customer is required" });
  }

  const conflictMessage = await findStyleConflict({
    orgId: organization.id,
    customer: payload.customer,
    name: payload.name,
    styleCode: payload.styleCode,
  });
  if (conflictMessage) {
    return res.status(409).json({ ok: false, error: conflictMessage });
  }

  const existing = await prisma.style.findFirst({
    where: { orgId: organization.id, styleId: payload.styleId },
  });
  if (existing) {
    return res
      .status(409)
      .json({ ok: false, error: "styleId already exists" });
  }

  const created = await prisma.style.create({
    data: {
      orgId: organization.id,
      ...payload,
    },
  });

  res.status(201).json(toStyleResponse(created));
});

app.put("/styles/:styleId", async (req, res) => {
  const organization = await getOrganizationByQuery(req);
  if (!organization) {
    return res.status(404).json({ ok: false, error: "organization not found" });
  }

  const styleId = (req.params.styleId ?? "").trim();
  if (!styleId) {
    return res.status(400).json({ ok: false, error: "styleId is required" });
  }

  const existing = await prisma.style.findFirst({
    where: { orgId: organization.id, styleId },
  });
  if (!existing) {
    return res.status(404).json({ ok: false, error: "style not found" });
  }

  const normalized = normalizeStylePayload(
    {
      id: existing.styleId,
      styleCode: req.body?.styleCode ?? existing.styleCode,
      name: req.body?.name ?? existing.name,
      customer: req.body?.customer ?? existing.customer,
      registrationDate: req.body?.registrationDate ?? existing.registrationDate,
      designer: req.body?.designer ?? existing.designer,
      collection: req.body?.collection ?? existing.collection,
      season: req.body?.season ?? existing.season,
      imageUrls: req.body?.imageUrls ?? existing.imageUrls,
      processes: req.body?.processes ?? existing.processes,
      bom: req.body?.bom ?? existing.bom,
      bomNotes: req.body?.bomNotes ?? existing.bomNotes,
    },
    existing.styleId
  );

  if (!normalized.name) {
    return res.status(400).json({ ok: false, error: "name is required" });
  }
  if (!normalized.customer) {
    return res.status(400).json({ ok: false, error: "customer is required" });
  }

  const conflictMessage = await findStyleConflict({
    orgId: organization.id,
    customer: normalized.customer,
    name: normalized.name,
    styleCode: normalized.styleCode,
    excludeUid: existing.uid,
  });
  if (conflictMessage) {
    return res.status(409).json({ ok: false, error: conflictMessage });
  }

  const updated = await prisma.style.update({
    where: { uid: existing.uid },
    data: {
      styleCode: normalized.styleCode,
      name: normalized.name,
      customer: normalized.customer,
      registrationDate: normalized.registrationDate,
      designer: normalized.designer,
      collection: normalized.collection,
      season: normalized.season,
      imageUrls: normalized.imageUrls,
      processes: normalized.processes,
      bom: normalized.bom,
      bomNotes: normalized.bomNotes,
    },
  });

  res.json(toStyleResponse(updated));
});

app.delete("/styles/:styleId", async (req, res) => {
  const organization = await getOrganizationByQuery(req);
  if (!organization) {
    return res.status(404).json({ ok: false, error: "organization not found" });
  }

  const styleId = (req.params.styleId ?? "").trim();
  if (!styleId) {
    return res.status(400).json({ ok: false, error: "styleId is required" });
  }

  try {
    await prisma.style.delete({
      where: {
        orgId_styleId: {
          orgId: organization.id,
          styleId,
        },
      },
    });
    res.status(204).send();
  } catch (error) {
    // P2025 = Record to delete does not exist.
    if (error?.code === 'P2025') {
      return res.status(404).json({ ok: false, error: "style not found" });
    }
    res.status(500).json({ ok: false, error: "failed to delete style" });
  }
});

app.post("/styles/import", async (req, res) => {
  const organization = await getOrganizationByQuery(req);
  if (!organization) {
    return res.status(404).json({ ok: false, error: "organization not found" });
  }

  const rows = Array.isArray(req.body?.styles) ? req.body.styles : [];
  if (rows.length === 0) {
    return res.status(400).json({ ok: false, error: "styles is required" });
  }

  const existingCount = await prisma.style.count({
    where: { orgId: organization.id },
  });
  if (existingCount > 0) {
    return res.status(409).json({ ok: false, error: "styles already exist" });
  }

  const normalizedRows = rows
    .map((item) => normalizeStylePayload(item))
    .filter((item) => item.name && item.customer);

  if (normalizedRows.length === 0) {
    return res
      .status(400)
      .json({ ok: false, error: "no valid styles to import" });
  }

  const seenNameKeys = new Set();
  const seenCodeKeys = new Set();
  for (const item of normalizedRows) {
    const nameKey = toStyleIdentityKey(item.customer, item.name);
    if (seenNameKeys.has(nameKey)) {
      return res.status(409).json({
        ok: false,
        error: "style name already exists for this customer",
      });
    }
    seenNameKeys.add(nameKey);

    const codeKey = toStyleIdentityKey(item.customer, item.styleCode);
    if (seenCodeKeys.has(codeKey)) {
      return res.status(409).json({
        ok: false,
        error: "style code already exists for this customer",
      });
    }
    seenCodeKeys.add(codeKey);
  }

  await prisma.$transaction(
    normalizedRows.map((item) =>
      prisma.style.upsert({
        where: {
          orgId_styleId: {
            orgId: organization.id,
            styleId: item.styleId,
          },
        },
        update: {
          styleCode: item.styleCode,
          name: item.name,
          customer: item.customer,
          registrationDate: item.registrationDate,
          designer: item.designer,
          collection: item.collection,
          season: item.season,
          imageUrls: item.imageUrls,
          processes: item.processes,
          bom: item.bom,
          bomNotes: item.bomNotes,
        },
        create: {
          orgId: organization.id,
          ...item,
        },
      })
    )
  );

  const imported = await prisma.style.findMany({
    where: { orgId: organization.id },
    orderBy: { uid: "asc" },
  });

  res.status(201).json(imported.map(toStyleResponse));
});

app.get("/attributes", async (req, res) => {
  const organization = await getOrganizationByQuery(req);
  if (!organization) {
    return res.status(404).json({ ok: false, error: "organization not found" });
  }
  await seedAttributesIfEmpty(organization.id);

  const [colors, categories, roles, processes] = await Promise.all([
      prisma.attrColor.findMany({
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
    categories,
    roles,
    processes,
  });
});

app.put("/attributes", async (req, res) => {
  const organization = await getOrganizationByQuery(req);
  if (!organization) {
    return res.status(404).json({ ok: false, error: "organization not found" });
  }
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
    code,
    businessNumber,
    representative,
    industry,
    address,
    phone,
    email,
    type,
  } = req.body ?? {};
  const normalizedCode = normalizeOrgCode(code);

  if (!name || typeof name !== "string") {
    return res.status(400).json({ ok: false, error: "name is required" });
  }

  if (code !== undefined) {
    if (!normalizedCode || !isValidOrgCode(normalizedCode)) {
      return res.status(400).json({
        ok: false,
        error: "code must be 4 uppercase letters",
      });
    }

    const existingCodeOwner = await prisma.organization.findFirst({
      where: { code: normalizedCode },
    });
    if (existingCodeOwner) {
      return res.status(409).json({ ok: false, error: "code already exists" });
    }
  }

  const organization = await prisma.organization.create({
    data: {
      name,
      code: normalizedCode,
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
    code,
    businessNumber,
    representative,
    industry,
    address,
    phone,
    email,
    type,
  } = req.body ?? {};
  const normalizedCode = normalizeOrgCode(code);

  if (code !== undefined) {
    if (!normalizedCode || !isValidOrgCode(normalizedCode)) {
      return res.status(400).json({
        ok: false,
        error: "code must be 4 uppercase letters",
      });
    }

    const existingCodeOwner = await prisma.organization.findFirst({
      where: {
        code: normalizedCode,
        NOT: { id },
      },
    });
    if (existingCodeOwner) {
      return res.status(409).json({ ok: false, error: "code already exists" });
    }
  }

  const organization = await prisma.organization.update({
    where: { id },
    data: {
      name,
      code: code !== undefined ? normalizedCode : undefined,
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

const assignOrgMembership = async (req, res) => {
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

  const safeRole = resolveRole(role, "OPERATOR");
  const now = new Date();

  const record = await prisma.orgMembership.upsert({
    where: { orgId_email: { orgId: orgIdNum, email: normalizedEmail } },
    update: { role: safeRole, status: "ACTIVE", approvedAt: now },
    create: {
      orgId: orgIdNum,
      email: normalizedEmail,
      role: safeRole,
      status: "ACTIVE",
      approvedAt: now,
    },
  });

  res.status(201).json(record);
};

app.post("/org-memberships/assign", assignOrgMembership);

const port = process.env.PORT || 4000;
app.listen(port, () => {
  console.log(`API running on http://localhost:${port}`);
});
