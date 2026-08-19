/**
 * German-locale formatting helpers.
 *
 * Formatters are created once — `Intl` constructors are comparatively
 * expensive and these run inside table rows.
 */

const DATE_FORMATTER = new Intl.DateTimeFormat('de-DE', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

const DATE_TIME_FORMATTER = new Intl.DateTimeFormat('de-DE', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

const CURRENCY_FORMATTERS = new Map<string, Intl.NumberFormat>();

function currencyFormatter(currency: string): Intl.NumberFormat {
  const cached = CURRENCY_FORMATTERS.get(currency);
  if (cached) return cached;

  const formatter = new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  });
  CURRENCY_FORMATTERS.set(currency, formatter);
  return formatter;
}

const NUMBER_FORMATTER = new Intl.NumberFormat('de-DE');

const COMPACT_FORMATTER = new Intl.NumberFormat('de-DE', {
  notation: 'compact',
  maximumFractionDigits: 1,
});

export function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return DATE_FORMATTER.format(date);
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return DATE_TIME_FORMATTER.format(date);
}

export function formatCurrency(
  value: number | null | undefined,
  currency = 'EUR',
): string {
  if (value === null || value === undefined) return '—';
  return currencyFormatter(currency).format(value);
}

/** Compact currency for KPI tiles, e.g. "12,4 Mio. €". */
export function formatCurrencyCompact(
  value: number | null | undefined,
  currency = 'EUR',
): string {
  if (value === null || value === undefined) return '—';
  return `${COMPACT_FORMATTER.format(value)} ${currency === 'EUR' ? '€' : currency}`;
}

export function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  return NUMBER_FORMATTER.format(value);
}

/** Whole days from today until `value`; negative once the date has passed. */
export function daysUntil(value: string | null | undefined): number | null {
  if (!value) return null;
  const target = new Date(value);
  if (Number.isNaN(target.getTime())) return null;

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const startOfTarget = new Date(target);
  startOfTarget.setHours(0, 0, 0, 0);

  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.round((startOfTarget.getTime() - startOfToday.getTime()) / msPerDay);
}

/** Human phrasing of a deadline distance, e.g. "in 5 Tagen", "morgen". */
export function formatDeadlineDistance(value: string | null | undefined): string {
  const days = daysUntil(value);
  if (days === null) return '—';
  if (days < 0) return `vor ${Math.abs(days)} Tagen abgelaufen`;
  if (days === 0) return 'heute';
  if (days === 1) return 'morgen';
  return `in ${days} Tagen`;
}

export function formatDuration(months: number | null | undefined): string {
  if (months === null || months === undefined) return '—';
  if (months < 12) return `${months} Monate`;
  const years = Math.floor(months / 12);
  const rest = months % 12;
  const yearLabel = years === 1 ? '1 Jahr' : `${years} Jahre`;
  return rest === 0 ? yearLabel : `${yearLabel}, ${rest} Monate`;
}

export function formatFileSize(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
