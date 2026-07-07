import "./config/env";
import { Prisma, PrismaClient } from "@prisma/client";
import {
  getCurrentRequestActor,
  getCurrentRequestActorEmployeeId,
} from "./requestActor";

type AuditModelConfig = {
  hasCreatedBy: boolean;
  hasUpdatedBy: boolean;
  hasCreatedByEmployeeId: boolean;
  hasUpdatedByEmployeeId: boolean;
  relationModels: Map<string, string>;
};

type AuditOperationMode = "create" | "update";

const modelAuditConfig = new Map<string, AuditModelConfig>(
  Prisma.dmmf.datamodel.models.map((model) => [
    model.name,
    {
      hasCreatedBy: model.fields.some((field) => field.name === "createdBy"),
      hasUpdatedBy: model.fields.some((field) => field.name === "updatedBy"),
      hasCreatedByEmployeeId: model.fields.some(
        (field) => field.name === "createdByEmployeeId"
      ),
      hasUpdatedByEmployeeId: model.fields.some(
        (field) => field.name === "updatedByEmployeeId"
      ),
      relationModels: new Map(
        model.fields
          .filter((field) => field.kind === "object")
          .map((field) => [field.name, field.type])
      ),
    },
  ])
);

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const hasMeaningfulValue = (value: unknown) => {
  if (typeof value === "string") return value.trim().length > 0;
  return value !== undefined && value !== null;
};

const assignActorIfMissing = (
  value: Record<string, unknown>,
  fieldName: "createdBy" | "updatedBy",
  actor: string
) => {
  if (!hasMeaningfulValue(value[fieldName])) {
    value[fieldName] = actor;
  }
};

const assignActorEmployeeIfMissing = (
  value: Record<string, unknown>,
  fieldName: "createdByEmployeeId" | "updatedByEmployeeId",
  employeeId: number | null
) => {
  if (!employeeId) return;
  if (!hasMeaningfulValue(value[fieldName])) {
    value[fieldName] = employeeId;
  }
};

const applyAuditFieldsToModelData = (
  modelName: string,
  value: unknown,
  mode: AuditOperationMode,
  actor: string
) => {
  if (Array.isArray(value)) {
    value.forEach((item) =>
      applyAuditFieldsToModelData(modelName, item, mode, actor)
    );
    return;
  }
  if (!isPlainObject(value)) return;

  const config = modelAuditConfig.get(modelName);
  if (!config) return;

  if (mode === "create" && config.hasCreatedBy) {
    assignActorIfMissing(value, "createdBy", actor);
  }
  if (config.hasUpdatedBy) {
    assignActorIfMissing(value, "updatedBy", actor);
  }
  const actorEmployeeId = getCurrentRequestActorEmployeeId();
  if (mode === "create" && config.hasCreatedByEmployeeId) {
    assignActorEmployeeIfMissing(
      value,
      "createdByEmployeeId",
      actorEmployeeId
    );
  }
  if (config.hasUpdatedByEmployeeId) {
    assignActorEmployeeIfMissing(
      value,
      "updatedByEmployeeId",
      actorEmployeeId
    );
  }

  for (const [relationFieldName, relatedModelName] of config.relationModels) {
    const relationValue = value[relationFieldName];
    if (!relationValue) continue;
    applyAuditFieldsToRelationOperation(relatedModelName, relationValue, actor);
  }
};

const applyAuditFieldsToRelationOperation = (
  modelName: string,
  value: unknown,
  actor: string
) => {
  if (Array.isArray(value)) {
    value.forEach((item) =>
      applyAuditFieldsToRelationOperation(modelName, item, actor)
    );
    return;
  }
  if (!isPlainObject(value)) return;

  if ("create" in value) {
    applyAuditFieldsToModelData(modelName, value.create, "create", actor);
  }
  const createManyValue = value.createMany;
  if (isPlainObject(createManyValue)) {
    applyAuditFieldsToModelData(
      modelName,
      createManyValue.data,
      "create",
      actor
    );
  }
  const connectOrCreateValue = value.connectOrCreate;
  if (Array.isArray(connectOrCreateValue)) {
    connectOrCreateValue.forEach((entry) => {
      if (isPlainObject(entry)) {
        applyAuditFieldsToModelData(modelName, entry.create, "create", actor);
      }
    });
  } else if (isPlainObject(connectOrCreateValue)) {
    applyAuditFieldsToModelData(
      modelName,
      connectOrCreateValue.create,
      "create",
      actor
    );
  }
  const upsertValue = value.upsert;
  if (Array.isArray(upsertValue)) {
    upsertValue.forEach((entry) => {
      if (!isPlainObject(entry)) return;
      applyAuditFieldsToModelData(modelName, entry.create, "create", actor);
      applyAuditFieldsToModelData(modelName, entry.update, "update", actor);
    });
  } else if (isPlainObject(upsertValue)) {
    applyAuditFieldsToModelData(modelName, upsertValue.create, "create", actor);
    applyAuditFieldsToModelData(modelName, upsertValue.update, "update", actor);
  }
  const updateValue = value.update;
  if (updateValue !== undefined) {
    applyAuditFieldsToModelData(modelName, updateValue, "update", actor);
  }
  const updateManyValue = value.updateMany;
  if (Array.isArray(updateManyValue)) {
    updateManyValue.forEach((entry) => {
      if (isPlainObject(entry)) {
        applyAuditFieldsToModelData(modelName, entry.data, "update", actor);
      }
    });
  } else if (isPlainObject(updateManyValue)) {
    applyAuditFieldsToModelData(modelName, updateManyValue.data, "update", actor);
  }
};

const basePrisma = new PrismaClient();

const prisma = basePrisma.$extends({
  query: {
    $allModels: {
      async $allOperations({ model, operation, args, query }) {
        if (typeof model === "string") {
          const actor = getCurrentRequestActor();
          switch (operation) {
            case "create":
            case "createMany":
            case "createManyAndReturn":
              applyAuditFieldsToModelData(model, args?.data, "create", actor);
              break;
            case "update":
            case "updateMany":
            case "updateManyAndReturn":
              applyAuditFieldsToModelData(model, args?.data, "update", actor);
              break;
            case "upsert":
              applyAuditFieldsToModelData(model, args?.create, "create", actor);
              applyAuditFieldsToModelData(model, args?.update, "update", actor);
              break;
            default:
              break;
          }
        }

        return query(args);
      },
    },
  },
}) as PrismaClient;

export { prisma };
