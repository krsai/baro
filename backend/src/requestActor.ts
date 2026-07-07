import { AsyncLocalStorage } from "node:async_hooks";
import { normalizeEmail } from "./utils/common";

const DEFAULT_REQUEST_ACTOR = "system@baro.local";
const LEGACY_REQUEST_ACTOR = "legacy@baro.local";

type RequestActorStore = {
  actor: string;
  employeeId: number | null;
};

const requestActorStorage = new AsyncLocalStorage<RequestActorStore>();

export const resolveRequestActor = (
  value: unknown,
  fallback = DEFAULT_REQUEST_ACTOR
) => {
  const normalized =
    typeof value === "string" ? normalizeEmail(value) : "";
  return normalized || fallback;
};

export const runWithRequestActor = <T>(
  actor: unknown,
  callback: () => T
) =>
  requestActorStorage.run(
    { actor: resolveRequestActor(actor), employeeId: null },
    callback
  );

export const getCurrentRequestActor = () =>
  requestActorStorage.getStore()?.actor || DEFAULT_REQUEST_ACTOR;

export const setCurrentRequestActorEmployeeId = (employeeId: unknown) => {
  const store = requestActorStorage.getStore();
  if (!store) return;
  const parsed =
    typeof employeeId === "number" && Number.isSafeInteger(employeeId) && employeeId > 0
      ? employeeId
      : null;
  store.employeeId = parsed;
};

export const getCurrentRequestActorEmployeeId = () =>
  requestActorStorage.getStore()?.employeeId ?? null;

export const getDefaultRequestActor = () => DEFAULT_REQUEST_ACTOR;

export const getLegacyRequestActor = () => LEGACY_REQUEST_ACTOR;
