/**
 * Onboarding rules for the first organisation.
 *
 * Kept out of the route handler and the form so both check the same thing,
 * and so the rules can be tested without a request or a browser
 * (CLAUDE.md § 6). The database enforces the same constraints again — this
 * layer exists to give a useful message, not to be the guard.
 */

export const ORGANIZATION_NAME_MAX_LENGTH = 160;
export const ORGANIZATION_SLUG_MIN_LENGTH = 3;
export const ORGANIZATION_SLUG_MAX_LENGTH = 50;

/** Mirrors the check in `create_first_organization`. */
export const ORGANIZATION_SLUG_PATTERN = /^[a-z0-9]([a-z0-9-]{1,48}[a-z0-9])$/;

const TRANSLITERATIONS: Record<string, string> = {
  ä: 'ae',
  ö: 'oe',
  ü: 'ue',
  ß: 'ss',
};

/**
 * Proposes a slug from an organisation name.
 *
 * A proposal, never a silent correction: the field stays editable and what
 * the user leaves there is what gets saved (CLAUDE.md § 10).
 */
export function suggestOrganizationSlug(name: string): string {
  const folded = name
    .toLowerCase()
    .replace(/[äöüß]/g, (char) => TRANSLITERATIONS[char] ?? char)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  const slug = folded
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, ORGANIZATION_SLUG_MAX_LENGTH)
    .replace(/-+$/g, '');

  return slug;
}

export interface OnboardingIssue {
  field: 'name' | 'slug';
  message: string;
}

/** Validates the form input. Returns every issue, not just the first. */
export function validateOnboardingInput(input: {
  name: string;
  slug: string;
}): OnboardingIssue[] {
  const issues: OnboardingIssue[] = [];
  const name = input.name.trim();
  const slug = input.slug.trim().toLowerCase();

  if (name.length === 0) {
    issues.push({ field: 'name', message: 'Bitte geben Sie den Namen Ihrer Organisation an.' });
  } else if (name.length > ORGANIZATION_NAME_MAX_LENGTH) {
    issues.push({
      field: 'name',
      message: `Der Name darf höchstens ${ORGANIZATION_NAME_MAX_LENGTH} Zeichen lang sein.`,
    });
  }

  if (!ORGANIZATION_SLUG_PATTERN.test(slug)) {
    issues.push({
      field: 'slug',
      message:
        `Die Kennung muss ${ORGANIZATION_SLUG_MIN_LENGTH} bis ${ORGANIZATION_SLUG_MAX_LENGTH} ` +
        'Zeichen lang sein und darf nur a–z, 0–9 und Bindestriche enthalten.',
    });
  }

  return issues;
}
