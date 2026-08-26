const STORAGE_PREFIX = 'baro:personal-preferences:v1';

const normalizePart = (value, fallback) => {
  const normalized = String(value ?? '').trim().toLowerCase();
  return normalized || fallback;
};

export const buildPersonalPreferencesKey = (profile, user) => {
  const email = normalizePart(profile?.email || user?.email, 'anonymous');
  const workspace = normalizePart(
    profile?.entryType === 'SYSTEM' ? 'system' : profile?.orgId,
    'no-workspace'
  );
  return `${STORAGE_PREFIX}:${email}:${workspace}`;
};

export const readPersonalPreferences = (profile, user) => {
  const defaults = { openDashboardOnLogin: false };
  if (typeof window === 'undefined') return defaults;
  try {
    const stored = JSON.parse(
      window.localStorage.getItem(buildPersonalPreferencesKey(profile, user)) || '{}'
    );
    return { ...defaults, openDashboardOnLogin: stored?.openDashboardOnLogin === true };
  } catch {
    return defaults;
  }
};

export const writePersonalPreferences = (profile, user, preferences) => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(
    buildPersonalPreferencesKey(profile, user),
    JSON.stringify({ openDashboardOnLogin: preferences?.openDashboardOnLogin === true })
  );
};
