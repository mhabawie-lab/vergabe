/**
 * Warnings sit next to the score, never below the fold. A caveat the reader has
 * to scroll for is a caveat that does not exist.
 */
export function WarningList({ warnings }: { warnings: readonly string[] }) {
  if (warnings.length === 0) {
    return (
      <p className="px-4 py-3 text-sm text-ink-soft">
        Keine Einschränkungen erkannt. Das heißt nicht, dass es keine gibt.
      </p>
    );
  }

  return (
    <ul className="divide-y divide-rule">
      {warnings.map((warning) => (
        <li key={warning} className="flex gap-2 px-4 py-3 text-sm text-ink">
          <span aria-hidden="true" className="mt-0.5 font-mono text-caution">
            !
          </span>
          <span>{warning}</span>
        </li>
      ))}
    </ul>
  );
}
