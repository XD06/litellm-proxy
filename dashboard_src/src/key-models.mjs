export function parseKeyModelsText(value) {
  const result = {};
  String(value || "").split(/[\n,;]+/).map((item) => item.trim()).filter(Boolean).forEach((item) => {
    const separator = item.indexOf("=");
    const canonical = (separator >= 0 ? item.slice(0, separator) : item).trim();
    const raw = (separator >= 0 ? item.slice(separator + 1) : item).trim();
    if (canonical && raw) result[canonical] = raw;
  });
  return result;
}

export function keyModelsPatchValue(value) {
  const models = parseKeyModelsText(value);
  return Object.keys(models).length ? models : null;
}
