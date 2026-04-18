function normalizeBrazilianTaxId(value: string) {
  return value.replace(/\D/g, "");
}

export function normalizePostalCode(value: string) {
  return value.replace(/\D/g, "");
}

function hasRepeatedDigits(value: string) {
  return /^(\d)\1+$/.test(value);
}

function isValidCpf(value: string) {
  if (!/^\d{11}$/.test(value) || hasRepeatedDigits(value)) {
    return false;
  }

  let sum = 0;
  for (let index = 0; index < 9; index += 1) {
    sum += Number(value[index]) * (10 - index);
  }

  let checkDigit = (sum * 10) % 11;
  if (checkDigit === 10) {
    checkDigit = 0;
  }

  if (checkDigit !== Number(value[9])) {
    return false;
  }

  sum = 0;
  for (let index = 0; index < 10; index += 1) {
    sum += Number(value[index]) * (11 - index);
  }

  checkDigit = (sum * 10) % 11;
  if (checkDigit === 10) {
    checkDigit = 0;
  }

  return checkDigit === Number(value[10]);
}

function isValidCnpj(value: string) {
  if (!/^\d{14}$/.test(value) || hasRepeatedDigits(value)) {
    return false;
  }

  const firstWeights = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const secondWeights = [6, ...firstWeights];

  let sum = 0;
  for (let index = 0; index < firstWeights.length; index += 1) {
    sum += Number(value[index]) * firstWeights[index];
  }

  let remainder = sum % 11;
  const firstDigit = remainder < 2 ? 0 : 11 - remainder;
  if (firstDigit !== Number(value[12])) {
    return false;
  }

  sum = 0;
  for (let index = 0; index < secondWeights.length; index += 1) {
    sum += Number(value[index]) * secondWeights[index];
  }

  remainder = sum % 11;
  const secondDigit = remainder < 2 ? 0 : 11 - remainder;
  return secondDigit === Number(value[13]);
}

export function validateBrazilianTaxId(value: string) {
  const normalized = normalizeBrazilianTaxId(value);

  if (!normalized) {
    return { normalized: null, error: "Informe o CPF ou CNPJ do responsável." };
  }

  if (![11, 14].includes(normalized.length)) {
    return { normalized: null, error: "Informe um CPF ou CNPJ válido." };
  }

  const valid = normalized.length === 11 ? isValidCpf(normalized) : isValidCnpj(normalized);

  return valid
    ? { normalized, error: null }
    : { normalized: null, error: "Informe um CPF ou CNPJ válido." };
}

export function validatePostalCode(value: string) {
  const normalized = normalizePostalCode(value);

  return normalized.length === 8
    ? { normalized, error: null }
    : { normalized: null, error: "Informe um CEP válido com 8 dígitos." };
}

export function formatPostalCode(value: string) {
  const normalized = normalizePostalCode(value).slice(0, 8);

  if (normalized.length <= 5) {
    return normalized;
  }

  return `${normalized.slice(0, 5)}-${normalized.slice(5)}`;
}
