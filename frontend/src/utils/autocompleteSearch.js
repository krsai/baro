const normalizeSearchValue = (value) =>
  String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[_/(),.-]+/g, ' ')
    .replace(/\s+/g, ' ');

const compactSearchValue = (value) => normalizeSearchValue(value).replace(/\s+/g, '');

const collectPrimitiveValues = (option) => {
  if (!option || typeof option !== 'object' || Array.isArray(option)) return [];
  return Object.values(option).flatMap((value) =>
    typeof value === 'string' || typeof value === 'number' ? [String(value)] : []
  );
};

const collectSearchCandidates = (option, getOptionLabel) => {
  if (typeof option === 'string' || typeof option === 'number') {
    return [String(option)];
  }

  const label = typeof getOptionLabel === 'function' ? getOptionLabel(option) : '';
  return Array.from(
    new Set(
      [
        label,
        option?.searchText,
        option?.displayName,
        option?.name,
        option?.label,
        option?.code,
        option?.description,
        option?.nameKo,
        option?.nameEn,
        option?.nameVi,
        option?.category,
        option?.spec,
        option?.color,
        ...collectPrimitiveValues(option),
      ].filter(Boolean)
    )
  );
};

export const tokenizeAutocompleteSearch = (value) =>
  normalizeSearchValue(value)
    .split(/\s+/)
    .filter(Boolean);

export const buildAutocompleteSearchBlob = (option, getOptionLabel) => {
  const candidates = collectSearchCandidates(option, getOptionLabel)
    .map((value) => normalizeSearchValue(value))
    .filter(Boolean);
  const compactCandidates = collectSearchCandidates(option, getOptionLabel)
    .map((value) => compactSearchValue(value))
    .filter(Boolean);

  return Array.from(new Set([...candidates, ...compactCandidates])).join(' ');
};

export const matchesAutocompleteSearch = (option, inputValue, getOptionLabel) => {
  const tokens = tokenizeAutocompleteSearch(inputValue);
  if (tokens.length === 0) return true;

  const searchBlob = buildAutocompleteSearchBlob(option, getOptionLabel);
  if (!searchBlob) return false;

  return tokens.every((token) => searchBlob.includes(token));
};

export const createAutocompleteFilterOptions =
  ({ getOptionLabel, limit } = {}) =>
  (options, state) => {
    const list = Array.isArray(options) ? options : [];
    const filtered = list.filter((option) =>
      matchesAutocompleteSearch(option, state?.inputValue ?? '', getOptionLabel)
    );

    if (Number.isInteger(limit) && limit > 0) {
      return filtered.slice(0, limit);
    }
    return filtered;
  };
