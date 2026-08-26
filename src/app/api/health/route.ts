import { describeBackend } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * GET /api/health
 *
 * For deployment probes. Deliberately says almost nothing: whether the
 * process is up and which backend it resolved to. No configuration, no host,
 * no version of anything that would help someone decide what to attack.
 *
 * Unauthenticated on purpose — a probe has no session — which is exactly why
 * it must not reveal more than this.
 */
export function GET() {
  let backend = 'unknown';
  let healthy = true;

  try {
    backend = describeBackend().backend;
    // A backend that cannot be resolved is not healthy, even if the process
    // is answering: the next data request would fail.
    healthy = backend === 'supabase' || backend === 'memory';
  } catch {
    healthy = false;
  }

  return Response.json(
    { status: healthy ? 'ok' : 'degraded', backend },
    { status: healthy ? 200 : 503, headers: { 'Cache-Control': 'no-store' } },
  );
}
