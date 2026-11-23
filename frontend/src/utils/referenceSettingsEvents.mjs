export const REFERENCE_SETTINGS_TOPICS = ['partner-classifications', 'accounting-codes', 'text-acronyms'];
export function referenceSettingsTopics(path) {
 if(/^\/system\/text-acronyms(?:\/|\?|$)/.test(path))return ['text-acronyms'];
 if(/^\/(partner-classifications|partner-editor|business-partners|customers|partners|organizations|organization-profile)(\/|\?|$)/.test(path))return ['partner-classifications','accounting-codes'];
 return /^\/system-setting-defaults\/(services|partner-roles|code-bases|codes)(\/|\?|$)/.test(path) ? ['partner-classifications','accounting-codes'] : [];
}
