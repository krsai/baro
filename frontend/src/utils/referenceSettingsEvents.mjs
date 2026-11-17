export const REFERENCE_SETTINGS_TOPICS = ['partner-classifications', 'accounting-codes'];
export function referenceSettingsTopics(path) {
 if(/^\/(partner-classifications|partner-editor|business-partners|customers|partners|organizations|organization-profile)(\/|\?|$)/.test(path))return REFERENCE_SETTINGS_TOPICS;
 return /^\/system-setting-defaults\/(services|partner-roles|code-bases|codes)(\/|\?|$)/.test(path) ? REFERENCE_SETTINGS_TOPICS : [];
}
