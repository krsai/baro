import { normalizeLanguageCode } from './appLanguage';

const toTrimmedText = (value) => String(value ?? '').trim();
const HANGUL_REGEX = /[\u1100-\u11FF\u3130-\u318F\uAC00-\uD7AF]/;
const LATIN_REGEX = /[A-Za-z\u00C0-\u024F\u1E00-\u1EFF]/;

const hasHangul = (text) => HANGUL_REGEX.test(text);
const hasLatin = (text) => LATIN_REGEX.test(text);

const splitKoAndLatinProcessName = (value) => {
  const text = toTrimmedText(value);
  if (!text || !text.includes('/')) return null;
  if (!(hasHangul(text) && hasLatin(text))) return null;

  const parts = text
    .split(/\s*\/\s*/)
    .map((part) => toTrimmedText(part))
    .filter(Boolean);
  if (parts.length < 2) return null;

  let splitIndex = -1;
  for (let index = 1; index < parts.length; index += 1) {
    const previous = parts[index - 1];
    const current = parts[index];
    if (hasHangul(previous) && !hasHangul(current) && hasLatin(current)) {
      splitIndex = index;
      break;
    }
  }

  if (splitIndex <= 0) {
    splitIndex = parts.findIndex(
      (part, index) => index > 0 && hasLatin(part) && !hasHangul(part)
    );
  }
  if (splitIndex <= 0 || splitIndex >= parts.length) return null;

  const ko = parts.slice(0, splitIndex).join(' / ');
  const latin = parts.slice(splitIndex).join(' / ');
  if (!ko || !latin) return null;
  return { ko, latin };
};

export const resolveLocalizedProcessName = (process, languageCode = 'en') => {
  if (!process || typeof process !== 'object') return '';

  const code = normalizeLanguageCode(languageCode, 'en');
  const nameKo = toTrimmedText(
    process?.nameKo ?? process?.processNameKo ?? process?.koName ?? process?.labelKo
  );
  const nameEn = toTrimmedText(
    process?.nameEn ?? process?.processNameEn ?? process?.enName ?? process?.labelEn
  );
  const nameVi = toTrimmedText(
    process?.nameVi ?? process?.processNameVi ?? process?.viName ?? process?.labelVi
  );
  const baseName = toTrimmedText(
    process?.name ?? process?.processName ?? process?.label ?? process?.code
  );

  if (code === 'ko' && nameKo) return nameKo;
  if (code === 'en' && nameEn) return nameEn;
  if (code === 'vi' && nameVi) return nameVi;

  const splitName = splitKoAndLatinProcessName(baseName);
  if (splitName) {
    if (code === 'ko') return splitName.ko;
    if (code === 'vi') return splitName.latin;
    return nameEn || splitName.latin || splitName.ko;
  }

  if (code === 'ko') return nameKo || nameEn || baseName || nameVi;
  if (code === 'vi') return nameVi || nameEn || baseName || nameKo;
  return nameEn || baseName || nameKo || nameVi;
};

export const formatProcessNameWithQuantity = (name, quantity) => {
  const baseName = toTrimmedText(name);
  const parsedQuantity = Number.parseInt(quantity, 10);
  if (!baseName) return '';
  if (!Number.isFinite(parsedQuantity) || parsedQuantity <= 1) return baseName;
  return `${baseName} x${parsedQuantity}`;
};

export const formatProcessLabelWithQuantity = ({
  code,
  name,
  nameKo,
  nameEn,
  nameVi,
  quantity,
  languageCode = 'en',
  fallback = '공정',
}) => {
  const localizedName = resolveLocalizedProcessName(
    {
      code,
      name,
      nameKo,
      nameEn,
      nameVi,
    },
    languageCode
  );
  const processName = formatProcessNameWithQuantity(localizedName || name || code, quantity) || fallback;
  return processName;
};
