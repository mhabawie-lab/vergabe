import { ShieldCheck } from 'lucide-react';

export default function AuthLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-surface-base px-4 py-10">
      <div className="mb-6 flex items-center gap-2.5">
        <span className="flex size-9 items-center justify-center rounded-xl bg-brand text-brand-foreground">
          <ShieldCheck className="size-5" aria-hidden />
        </span>
        <div>
          <p className="text-base font-semibold tracking-tight text-text-primary">
            SicherVergabe
          </p>
          <p className="text-xs text-text-muted">Vergabe-Intelligence</p>
        </div>
      </div>

      <div className="w-full max-w-sm">{children}</div>

      <p className="mt-6 max-w-sm text-center text-[11px] text-text-muted">
        Interne Vorabversion. Der Datenbestand besteht in Phase 1 ausschließlich
        aus gekennzeichneten DEMO-Daten.
      </p>
    </div>
  );
}
