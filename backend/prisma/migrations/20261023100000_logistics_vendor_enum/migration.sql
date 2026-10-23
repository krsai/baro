-- Enum values must be committed before they are used by the next migration.
ALTER TYPE "OrganizationType" ADD VALUE IF NOT EXISTS 'LOGISTICS_PROVIDER';
