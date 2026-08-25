/**
 * Fixtures for the Subunternehmer-Radar tests.
 *
 * Every value here is invented — `Muster`, `Beispiel`, `.invalid` domains that
 * can never resolve. Real partner data must never enter this repository, in
 * any file (`docs/data-protection.md`, § 1).
 */

import {
  createEmptyPartnerTables,
  MemoryPartnerStore,
  type PartnerTables,
} from '@/lib/db/memory/partner-store';
import { normalizeClientName } from '@/modules/references/normalize';
import type { CreatePartnerInput, SaveNeedInput } from '@/lib/db/partner-ports';
import type { PartnerCompany } from '@/types/partner';

export const ORG_A = '00000000-0000-4000-8000-00000000000a';
export const ORG_B = '00000000-0000-4000-8000-00000000000b';
export const USER = '00000000-0000-4000-8000-0000000000u1';

export function createStore(): { store: MemoryPartnerStore; tables: PartnerTables } {
  const tables = createEmptyPartnerTables();
  return { store: new MemoryPartnerStore(tables), tables };
}

/** A company with sensible defaults; override only what the test cares about. */
export function companyInput(
  legalName: string,
  overrides: Partial<CreatePartnerInput> = {},
): CreatePartnerInput {
  return {
    organizationId: ORG_A,
    createdBy: USER,
    legalName,
    normalizedName: normalizeClientName(legalName),
    tradeName: null,
    relationshipDirection: 'can_work_for_us',
    partnerLevel: 'subcontractor',
    status: 'prospect',
    verificationStatus: 'unverified',
    country: 'DE',
    region: 'Musterland',
    city: 'Musterstadt',
    postalCode: '00000',
    address: null,
    website: null,
    email: null,
    phone: null,
    registryName: null,
    registryNumber: null,
    vatId: null,
    lei: null,
    staffModel: 'own_staff',
    furtherSubcontractingStatus: 'unknown',
    datacenterExperienceStatus: 'unknown',
    isPreferred: false,
    isBlocked: false,
    blockedReason: null,
    internalRating: null,
    sourceType: 'phone_call',
    sourceName: 'Musterkontakt',
    sourceUrl: null,
    lastContactAt: null,
    nextFollowUpAt: null,
    internalNotes: null,
    linkedBusinessClientId: null,
    ...overrides,
  };
}

/** Today plus/minus a number of days, as an ISO date. */
export function isoDay(offsetDays: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

export function isoDateTime(offsetDays: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return date.toISOString();
}

/** A company that satisfies every criterion of the standard need below. */
export async function seedIdealPartner(
  store: MemoryPartnerStore,
  legalName = 'Muster Wachdienst GmbH',
): Promise<PartnerCompany> {
  const company = await store.createCompany(
    companyInput(legalName, {
      status: 'qualified',
      datacenterExperienceStatus: 'confirmed',
      furtherSubcontractingStatus: 'not_allowed',
    }),
  );

  await store.saveService({
    organizationId: ORG_A,
    partnerCompanyId: company.id,
    serviceCategory: 'security',
    serviceLabel: null,
    confirmation: 'confirmed',
    confirmationSource: 'manual',
    capacityNote: null,
    availableStaff: 20,
    deliveryMode: 'own',
    note: null,
  });

  await store.saveRegion({
    organizationId: ORG_A,
    partnerCompanyId: company.id,
    country: 'DE',
    region: 'Musterland',
    city: 'Musterstadt',
    radiusKm: 80,
    nationwide: false,
    willingToTravel: true,
    isConfirmed: true,
    note: null,
  });

  await store.saveAvailability({
    organizationId: ORG_A,
    partnerCompanyId: company.id,
    serviceCategory: 'security',
    availableFrom: isoDay(-10),
    availableUntil: isoDay(300),
    status: 'available',
    availableStaff: 20,
    shiftModel: 'three_shift',
    nightShift: true,
    weekend: true,
    aroundTheClock: true,
    shortNotice: true,
    note: null,
    confirmNow: true,
  });

  for (const type of ['trade_registration', 'guard_permit', 'liability_insurance'] as const) {
    await store.saveQualification({
      organizationId: ORG_A,
      partnerCompanyId: company.id,
      credentialType: type,
      title: null,
      issuer: 'Musterbehörde',
      documentNumber: null,
      validFrom: isoDay(-100),
      validUntil: isoDay(400),
      reviewStatus: 'accepted',
      reviewedBy: USER,
      note: null,
    });
  }

  return company;
}

/** The standard need the matching tests score against. */
export function standardNeed(): SaveNeedInput {
  return {
    organizationId: ORG_A,
    title: 'Musterprojekt Objektschutz',
    referenceProjectId: null,
    tenderId: null,
    projectType: 'Rechenzentrum',
    serviceCategory: 'security',
    country: 'DE',
    region: 'Musterland',
    city: 'Musterstadt',
    siteAddress: null,
    radiusKm: 50,
    startDate: isoDay(30),
    endDate: isoDay(200),
    requiredStaff: 10,
    shiftModel: 'three_shift',
    aroundTheClock: true,
    nightWork: true,
    weekendWork: true,
    requiredQualifications: [],
    requiredCredentials: ['guard_permit', 'liability_insurance'],
    furtherSubcontractingAllowed: 'not_allowed',
    targetBudget: null,
    currency: 'EUR',
    confidentiality: 'confidential',
    status: 'active',
    internalNote: null,
    createdBy: USER,
  };
}
