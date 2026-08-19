import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 text-center">
      <p className="tabular text-sm font-medium text-text-muted">404</p>
      <h1 className="mt-2 text-xl font-semibold tracking-tight text-text-primary">
        Seite nicht gefunden
      </h1>
      <p className="mt-2 max-w-md text-sm text-text-secondary">
        Die aufgerufene Adresse existiert nicht oder der Datensatz wurde
        entfernt.
      </p>
      <Link
        href="/dashboard"
        className="mt-5 inline-flex h-9 items-center rounded-lg bg-brand px-3.5 text-sm font-medium text-brand-foreground transition-colors hover:bg-brand-hover"
      >
        Zum Dashboard
      </Link>
    </div>
  );
}
