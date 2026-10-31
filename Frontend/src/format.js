// The API sends prices as plain numbers (major units, e.g. 899.1) and dates as YYYY-MM-DD.
const CURRENCY = import.meta.env.VITE_CURRENCY || 'INR';

export const money = (n) =>
  new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: CURRENCY,
    minimumFractionDigits: Number.isInteger(n) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(n);

export const date = (s) =>
  s ? new Date(`${s}T00:00:00Z`).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' }) : '–';

export const cycleLabel = (c) => (c === 'yearly' ? 'yr' : 'mo');
export const net = (price, discountPct) => Math.round(price * (1 - discountPct / 100) * 100) / 100;
export const addDays = (s, n) => {
  const d = new Date(`${s}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
