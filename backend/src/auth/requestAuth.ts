import { type Request } from "express";
import {
  createRemoteJWKSet,
  jwtVerify,
  type JWTPayload,
  errors as joseErrors,
} from "jose";
import { normalizeEmail, resolveOptionalString } from "../utils/common";
import { createHttpError, readRequestHeader } from "../utils/http";

const requestAuthSymbol = Symbol("requestAuth");
const DEFAULT_SUPABASE_URL = "https://mqohhiufmjnfuhxpfwkn.supabase.co";

export type VerifiedRequestAuth = {
  accessToken: string;
  email: string;
  subject: string;
  role: string;
  claims: JWTPayload;
};

type RequestWithAuth = Request & {
  [requestAuthSymbol]?: VerifiedRequestAuth | null;
};

const normalizeSupabaseUrl = (value: unknown) => {
  const normalized = resolveOptionalString(value, null);
  if (!normalized) return "";
  return normalized.replace(/\/+$/, "");
};

const getSupabaseUrl = () =>
  normalizeSupabaseUrl(
    process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || DEFAULT_SUPABASE_URL
  );

const getSupabaseIssuer = () => {
  const supabaseUrl = getSupabaseUrl();
  return supabaseUrl ? `${supabaseUrl}/auth/v1` : "";
};

let cachedJwksUrl = "";
let cachedJwks: ReturnType<typeof createRemoteJWKSet> | null = null;

const getSupabaseJwks = () => {
  const issuer = getSupabaseIssuer();
  if (!issuer) {
    throw createHttpError(500, "SUPABASE_URL is not configured");
  }

  const jwksUrl = `${issuer}/.well-known/jwks.json`;
  if (!cachedJwks || cachedJwksUrl !== jwksUrl) {
    cachedJwks = createRemoteJWKSet(new URL(jwksUrl));
    cachedJwksUrl = jwksUrl;
  }
  return cachedJwks;
};

const setVerifiedRequestAuth = (
  req: Request,
  auth: VerifiedRequestAuth | null
) => {
  (req as RequestWithAuth)[requestAuthSymbol] = auth;
  return auth;
};

export const getVerifiedRequestAuth = (req: Request) =>
  (req as RequestWithAuth)[requestAuthSymbol] ?? null;

export const getBearerAccessToken = (req: Request) => {
  const authorization = readRequestHeader(req, "authorization");
  if (!authorization) return "";
  const [scheme, ...rest] = authorization.split(/\s+/);
  if (!scheme || scheme.toLowerCase() !== "bearer") {
    throw createHttpError(401, "authorization header must use Bearer token");
  }
  const token = rest.join(" ").trim();
  if (!token) {
    throw createHttpError(401, "authorization bearer token is required");
  }
  return token;
};

export const resolveRequestAuthErrorMessage = (error: unknown) => {
  if (error instanceof joseErrors.JOSEError) {
    return "invalid access token";
  }
  return typeof (error as any)?.message === "string" && (error as any).message.trim()
    ? (error as any).message.trim()
    : "failed to verify access token";
};

const verifySupabaseAccessToken = async (
  accessToken: string
): Promise<VerifiedRequestAuth> => {
  const issuer = getSupabaseIssuer();
  if (!issuer) {
    throw createHttpError(500, "SUPABASE_URL is not configured");
  }

  const { payload } = await jwtVerify(accessToken, getSupabaseJwks(), {
    issuer,
    audience: "authenticated",
  });
  const email = normalizeEmail(payload.email);
  if (!email) {
    throw createHttpError(401, "authenticated user email is missing");
  }
  const subject = resolveOptionalString(payload.sub, null);
  if (!subject) {
    throw createHttpError(401, "authenticated user subject is missing");
  }

  return {
    accessToken,
    email,
    subject,
    role: resolveOptionalString(payload.role, null) || "",
    claims: payload,
  };
};

export const populateVerifiedRequestAuth = async (req: Request) => {
  const accessToken = getBearerAccessToken(req);
  if (!accessToken) {
    return setVerifiedRequestAuth(req, null);
  }
  const verified = await verifySupabaseAccessToken(accessToken);
  return setVerifiedRequestAuth(req, verified);
};
