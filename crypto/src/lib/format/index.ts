/** Display formatting for the German UI. Presentation only — no domain logic. */

const currency = new Intl.NumberFormat('de-DE', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 2,
});

const currencySmall = new Intl.NumberFormat('de-DE', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 6,
});

const percent = new Intl.NumberFormat('de-DE', {
  style: 'percent',
  maximumFractionDigits: 2,
  signDisplay: 'exceptZero',
});

const decimal = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 2 });

export function formatPrice(value: number): string {
  return value < 1 ? currencySmall.format(value) : currency.format(value);
}

export function formatPercent(fraction: number): string {
  return percent.format(fraction);
}

export function formatNumber(value: number, digits = 2): string {
  return new Intl.NumberFormat('de-DE', { maximumFractionDigits: digits }).format(value);
}

export function formatQuantity(value: number): string {
  return new Intl.NumberFormat('de-DE', { maximumFractionDigits: 8 }).format(value);
}

export function formatCompact(value: number): string {
  return new Intl.NumberFormat('de-DE', { notation: 'compact', maximumFractionDigits: 1 }).format(
    value,
  );
}

export function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat('de-DE', { dateStyle: 'short', timeStyle: 'short' }).format(
    new Date(iso),
  );
}

export function formatRelativeTime(iso: string, now = Date.now()): string {
  const diffMs = new Date(iso).getTime() - now;
  const minutes = Math.round(diffMs / 60_000);
  const rtf = new Intl.RelativeTimeFormat('de-DE', { numeric: 'auto' });
  if (Math.abs(minutes) < 60) return rtf.format(minutes, 'minute');
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return rtf.format(hours, 'hour');
  return rtf.format(Math.round(hours / 24), 'day');
}

export { decimal };
