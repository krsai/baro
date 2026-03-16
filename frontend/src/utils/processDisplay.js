const toTrimmedText = (value) => String(value ?? '').trim();

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
  quantity,
  fallback = '공정',
}) => {
  const processCode = toTrimmedText(code);
  const processName = formatProcessNameWithQuantity(name, quantity) || fallback;
  if (!processCode) return processName;
  return `[${processCode}] ${processName}`;
};
