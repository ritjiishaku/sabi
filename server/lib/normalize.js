export function normalizeHeader(header) {
  return String(header ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

export function cell(value) {
  return String(value ?? '').trim();
}

export function stringifyValue(value) {
  if (value === null || value === undefined) return '';
  return String(value);
}

export function stringifyRow(row, columns) {
  const out = {};
  for (const col of columns) out[col] = stringifyValue(row[col]);
  return out;
}

const TRUTHY = new Set(['true', '1', 'yes']);
const FALSY = new Set(['false', '0', 'no']);

export function normalizeToggle(value) {
  const v = cell(value).toLowerCase();
  if (v === '') return '';
  if (TRUTHY.has(v)) return 'TRUE';
  if (FALSY.has(v)) return 'FALSE';
  return cell(value).toUpperCase();
}

export function parsePrice(value) {
  const v = cell(value)
    .replace(/^(₦|NGN)\s*/i, '')
    .replace(/,/g, '')
    .trim();
  return /^-?\d+(\.\d+)?$/.test(v) ? Number(v) : null;
}
