/** Manufacturer ownership and customer identity are separate foreign keys. */
export const styleAccessWhere = (organization: { id: number; type: string }, ownerOrgId: number | null = null) => ({
  ...(organization.type === 'MANUFACTURER'
    ? { orgId: organization.id }
    : organization.type === 'BRAND' ? { customerOrgId: organization.id } : { id: -1 }),
  ...(ownerOrgId === null ? {} : { AND: [{ orgId: ownerOrgId }] }),
});

export const canManageStyle = (organization: { id: number; type: string }, style: { orgId: number }) =>
  organization.type === 'MANUFACTURER' && organization.id === style.orgId;
