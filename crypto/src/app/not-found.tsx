import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="py-16">
      <p className="eyebrow">404</p>
      <h1 className="font-display text-3xl font-semibold tracking-tight">Nicht gefunden</h1>
      <p className="mt-2 max-w-md text-sm text-ink-soft">
        Diese Seite gibt es nicht. Diese Coin wird vielleicht nicht beobachtet — im Radar stehen
        alle, die ausgewertet werden.
      </p>
      <Link
        href="/"
        className="mt-4 inline-block border border-rule px-3 py-2 font-display text-sm transition-colors hover:border-accent hover:text-accent"
      >
        Zum Radar
      </Link>
    </div>
  );
}
