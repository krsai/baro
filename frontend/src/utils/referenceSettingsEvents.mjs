export const REFERENCE_SETTINGS_TOPICS = ['partner-classifications', 'accounting-codes'];
export function referenceSettingsTopics(path) {
 return /^\/system-setting-defaults\/(services|partner-roles|code-bases|codes)(\/|\?|$)/.test(path) ? REFERENCE_SETTINGS_TOPICS : [];
}
