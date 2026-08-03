export function niceChartMax(value) {
  const raw = Math.max(1, Number(value || 1));
  const magnitude = Math.pow(10, Math.floor(Math.log10(raw)));
  const normalized = raw / magnitude;
  const step = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 3 ? 3 : normalized <= 5 ? 5 : 10;
  return step * magnitude;
}

export function chartScaleMax(values, { fallback = 1, nice = false, padding = 1.15 } = {}) {
  const observed = Math.max(0, ...(Array.isArray(values) ? values : []).map((value) => {
    const number = Number(value || 0);
    return Number.isFinite(number) ? number : 0;
  }));
  const maximum = observed > 0 ? observed * padding : Math.max(Number(fallback || 0), Number.EPSILON);
  return nice ? niceChartMax(maximum) : maximum;
}

export function positiveChartPoints(points) {
  return (Array.isArray(points) ? points : []).filter((point) => Number(point?.value || 0) > 0);
}
