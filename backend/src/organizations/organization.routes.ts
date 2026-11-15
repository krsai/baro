import {companyDocumentContactUpdate} from '../services/companyDocumentContact';
import {businessLegalForm} from '../services/businessLegalForm';
import {saveCompanyProfileAndClassification} from '../services/companyIndustries';
import { normalizeEntityNameInput } from '../utils/localizedName';
import { Prisma } from "@prisma/client";
import { Router } from "express";
import { prisma } from "../db";
import {
  attachOrganizationSubscription,
  ensureOrganizationSubscription,
  getOrganizationByQuery,
  getRequesterEmail,
  requireSystemAdmin,
} from "../middleware/access";
import {resolvePartnerCode} from '../services/entityProfile';

type OrganizationRoutesDeps = {
  applySubscriptionPayload: (organization: any, payload?: any) => Promise<any>;
  toOrganizationResponse: (organization: any) => any;
};

const normalizeOptionalOrganizationText = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized || null;
};

const hasSubscriptionPayload = (payload: any = {}) =>
  payload.subscriptionStatus !== undefined ||
  payload.status !== undefined ||
  payload.serviceContactEmail !== undefined ||
  payload.membershipEmail !== undefined ||
  payload.billingEmail !== undefined ||
  payload.trialStartedAt !== undefined ||
  payload.trialEndsAt !== undefined ||
  payload.activeEndsAt !== undefined;

const findOrganizationProfileById = (id: number) =>
  prisma.organization.findUnique({
    where: { id },
  });

export const createOrganizationRouter = ({
  applySubscriptionPayload,
  toOrganizationResponse,
}: OrganizationRoutesDeps) => {
  const organizationRouter = Router();
  organizationRouter.use(normalizeEntityNameInput);

  organizationRouter.get("/organizations", async (req, res) => {
    const requesterEmail = getRequesterEmail(req);
    if (!requesterEmail) {
      return res.status(401).json({ ok: false, error: "authentication is required" });
    }

    const organizations = await prisma.organization.findMany({
      // 2026-08-20: vendor Organizations (PROCESS_OUTSOURCING/MATERIAL_SUPPLIER,
      // merged from BusinessPartner) must never appear in this list - they
      // are not real tenants and must never get an auto-created subscription
      // via attachOrganizationSubscription below. See AGENTS.md.
      where: { type: { in: ["MANUFACTURER", "BRAND", "SERVICE"] } },
      orderBy: { id: "asc" },
    });
    const withSubscriptions = await Promise.all(
      organizations.map((organization) => attachOrganizationSubscription(organization))
    );
    res.json(withSubscriptions.map(toOrganizationResponse));
  });

  organizationRouter.get("/organizations/primary", async (req, res) => {
    const organization = await getOrganizationByQuery(req, { allowSuspended: true });
    if (!organization) {
      return res.status(404).json({ error: "organization not found" });
    }
    const organizationWithRepresentative =
      (await findOrganizationProfileById(organization.id)) ?? organization;
    return res.json(toOrganizationResponse(organizationWithRepresentative));
  });

  organizationRouter.post("/organizations", async (req, res) => {
    if (!(await requireSystemAdmin(req, res))) return;

    const {
      name,
      nameKo,
      nameVi,
      code,
      businessNumber,
      representativeEmployeeId,
      industry,
      country,
      defaultSizeSetCode,
      type,
    } = req.body ?? {};
    const normalizedCode = resolvePartnerCode(code,name);

    if (!name || typeof name !== "string") {
      return res.status(400).json({ ok: false, error: "name is required" });
    }

    if(representativeEmployeeId!=null&&representativeEmployeeId!=='')return res.status(400).json({error:'COMPANY_DOCUMENT_CONTACT_IS_MANUAL'});
    const contactData=companyDocumentContactUpdate(req.body??{},{});

    {
      const existingCodeOwner = await prisma.organization.findFirst({
        where: { code: {equals:normalizedCode,mode:'insensitive'} },
      });
      if (existingCodeOwner) {
        return res.status(409).json({ ok: false, error: "PARTNER_CODE_CONFLICT" });
      }
    }

    const organization = await prisma.organization.create({
      data: {
        name,
        nameKo: normalizeOptionalOrganizationText(nameKo),
        nameVi: normalizeOptionalOrganizationText(nameVi),
        code: normalizedCode,
        businessNumber,
        businessLegalForm:businessLegalForm(req.body?.businessLegalForm)??null,
        ...contactData,
        industry,
        country,
        defaultSizeSetCode:
          defaultSizeSetCode === "URD_NUMERIC" ? "URD_NUMERIC" : "LEGACY_APPAREL",
        type,
      },
    });

    await applySubscriptionPayload(organization, req.body ?? {});
    const withSubscription = await attachOrganizationSubscription(organization);
    return res.status(201).json(toOrganizationResponse(withSubscription));
  });

  organizationRouter.put(["/organizations/:id", "/organizations/:id/profile"], async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ ok: false, error: "invalid id" });
    }

    const requesterEmail = getRequesterEmail(req);
    if (!requesterEmail) {
      return res.status(401).json({ ok: false, error: "request user email is required" });
    }

    const [systemUser, employee] = await Promise.all([
      prisma.systemUser.findUnique({
        where: { email: requesterEmail },
        select: { systemRole: true },
      }),
      prisma.employee.findUnique({
        where: { orgId_email: { orgId: id, email: requesterEmail } },
        select: { id:true, status: true, orgRole: true },
      }),
    ]);

    const isSystemAdmin = systemUser?.systemRole === "SYSTEM_ADMIN";
    const isOrgAdmin = employee?.status === "ACTIVE" && employee?.orgRole === "ADMIN";
    const isProfileUpdate=String(req.path||'').replace(/\/+$/,'').toLowerCase().endsWith('/profile');
    if((isProfileUpdate||req.body?.classification!==undefined)&&!isOrgAdmin)return res.status(403).json({error:'COMPANY_INDUSTRY_ADMIN_REQUIRED'});

    if (!isSystemAdmin && !isOrgAdmin) {
      return res.status(403).json({ ok: false, error: "admin access required" });
    }

    const {
      name,
      nameKo,
      nameVi,
      code,
      businessNumber,
      representativeEmployeeId,
      industry,
      country,
      defaultSizeSetCode,
      type,
    } = req.body ?? {};

    if (type !== undefined && !isSystemAdmin) {
      return res.status(403).json({
        ok: false,
        error: "system admin access required to change type",
      });
    }

    if (hasSubscriptionPayload(req.body ?? {}) && !isSystemAdmin) {
      return res.status(403).json({
        ok: false,
        error: "system admin access required to change subscription",
      });
    }

    const current=await prisma.organization.findUnique({where:{id},select:{name:true,code:true,industry:true,representative:true,phone:true,email:true,address:true}});
    if(!current)return res.status(404).json({error:'organization not found'});
    if(industry!==undefined&&industry!==null&&industry!==current.industry&&
      (typeof industry!=='string'||!await prisma.partnerRole.findUnique({where:{code:industry}})))return res.status(400).json({error:'INVALID_PARTNER_ROLE'});
    const normalizedCode = code!==undefined || !current.code&&!isProfileUpdate&&req.body?.classification===undefined ? resolvePartnerCode(code,name??current.name) : undefined;

    if (normalizedCode !== undefined) {
      const existingCodeOwner = await prisma.organization.findFirst({
        where: {
          code: {equals:normalizedCode,mode:'insensitive'},
          NOT: { id },
        },
      });
      if (existingCodeOwner) {
        return res.status(409).json({ ok: false, error: "PARTNER_CODE_CONFLICT" });
      }
    }

    if(representativeEmployeeId!=null&&representativeEmployeeId!=='')return res.status(400).json({error:'COMPANY_DOCUMENT_CONTACT_IS_MANUAL'});
    const contactData=companyDocumentContactUpdate(req.body??{},current);

    const organizationUpdateData: Prisma.OrganizationUpdateInput = {
      name,
      businessNumber,
      ...(req.body?.businessLegalForm!==undefined?{businessLegalForm:businessLegalForm(req.body.businessLegalForm)??null}:{}),
      ...contactData,
      industry,
      country,

      ...(defaultSizeSetCode !== undefined
        ? {
            defaultSizeSetCode:
              defaultSizeSetCode === "URD_NUMERIC" ? "URD_NUMERIC" : "LEGACY_APPAREL",
          }
        : {}),
      ...((Object.keys(contactData).length||representativeEmployeeId===null)?{representativeEmployee:{disconnect:true}}:{}),
      ...(nameKo !== undefined
        ? { nameKo: normalizeOptionalOrganizationText(nameKo) }
        : {}),
      ...(nameVi !== undefined
        ? { nameVi: normalizeOptionalOrganizationText(nameVi) }
        : {}),
      ...(isSystemAdmin && type !== undefined ? { type } : {}),
      ...(normalizedCode !== undefined ? { code: normalizedCode } : {}),
    };

    const combined=req.body?.classification!==undefined?await saveCompanyProfileAndClassification(prisma,id,employee!.id,organizationUpdateData,req.body.classification):null;
    const organization = combined?.organization || await prisma.organization.update({
      where: { id },
      data: organizationUpdateData,
    });

    if (isSystemAdmin) {
      await applySubscriptionPayload(organization, req.body ?? {});
    }
    const withSubscription = await attachOrganizationSubscription(organization);
    return res.json({...toOrganizationResponse(withSubscription),...(combined?{classification:combined.classification}:{})});
  });

  organizationRouter.get("/organizations/:id/subscription", async (req, res) => {
    if (!(await requireSystemAdmin(req, res))) return;

    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ ok: false, error: "invalid id" });
    }

    const organization = await prisma.organization.findUnique({
      where: { id },
    });
    if (!organization) {
      return res.status(404).json({ ok: false, error: "organization not found" });
    }

    const subscription = await ensureOrganizationSubscription(organization);
    return res.json(
      toOrganizationResponse({
        ...organization,
        subscription,
      }).subscription
    );
  });

  organizationRouter.patch("/organizations/:id/subscription", async (req, res) => {
    if (!(await requireSystemAdmin(req, res))) return;

    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ ok: false, error: "invalid id" });
    }

    const organization = await prisma.organization.findUnique({
      where: { id },
    });
    if (!organization) {
      return res.status(404).json({ ok: false, error: "organization not found" });
    }

    await applySubscriptionPayload(organization, req.body ?? {});
    const withSubscription = await attachOrganizationSubscription(organization);
    return res.json(toOrganizationResponse(withSubscription));
  });

  return organizationRouter;
};
