import { type Request } from "express";

export const createHttpError = (status: number, message: string) => {
  const error = new Error(message) as Error & { status: number };
  error.status = status;
  return error;
};

export const toErrorRecord = (error: unknown): Record<string, unknown> | null =>
  error && typeof error === "object" ? (error as Record<string, unknown>) : null;

export const getErrorStatus = (error: unknown): number | null => {
  const status = Number(toErrorRecord(error)?.status);
  return Number.isFinite(status) ? status : null;
};

export const getErrorMessage = (error: unknown, fallback: string): string => {
  const message = toErrorRecord(error)?.message;
  return typeof message === "string" && message.trim() ? message : fallback;
};

export const getErrorCode = (error: unknown): string => {
  const code = toErrorRecord(error)?.code;
  return typeof code === "string" ? code : "";
};

export const readRequestHeader = (req: Request, name: string): string => {
  const raw = req.header(name);
  return typeof raw === "string" ? raw.trim() : "";
};
