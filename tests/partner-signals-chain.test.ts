/**
 * Signals and the subcontracting chain.
 *
 * Two governing rules: an observation without a retraceable source must not
 * enter the system at all, and a chain must not close a cycle, exceed its
 * depth, or lose a partner who was blocked after the fact.
 */

import { describe, expect, it } from 'vitest';
import {
  applySignalAction,
  countsAsOpenDemand,
  isDemandSignal,
  isSignalExpired,
  SignalRuleError,
  suggestDirectionFromSignal,
  validateSignalInput,
} from '@/modules/partners/signals';
import {
  buildChainTree,
  ChainRuleError,
  flattenChain,
  mayAddChildAssignment,
  validateChainLink,
} from '@/modules/partners/chain';
import { parsePartnerQuery } from '@/modules/partners/query';
import { MAX_CHAIN_DEPTH } from '@/types/partner';
import { companyInput, createStore, isoDay, ORG_A, ORG_B, USER } from './partner-fixtures';

function signalInput(overrides: Record<string, unknown> = {}) {
  return {
    organizationId: ORG_A,
    partnerCompanyId: null,
    companyNameRaw: 'Beispiel Bau AG',
    signalType: 'seeks_security' as const,
    serviceCategory: 'security' as const,
    projectName: 'Musterprojekt',
    country: 'DE',
    region: 'Musterland',
    city: 'Musterstadt',
    description: 'Beispielhafte Beobachtung.',
    sourceType: 'website' as const,
    sourceName: 'Karriereseite',
    sourceUrl: 'https://beispiel-bau.invalid/karriere',
    observedAt: isoDay(-1),
    validUntil: null,
    confidence: 'medium' as const,
    status: 'new' as const,
    assignedTo: null,
    nextAction: null,
    followUpAt: null,
    internalNote: null,
    createdBy: USER,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------

describe('Signale', () => {
  it('57 — legt ein Signal an', async () => {
    const { store } = createStore();
    const signal = await store.saveSignal(signalInput());
    expect(signal?.signalType).toBe('seeks_security');
    expect(signal?.status).toBe('new');
  });

  it('58 — eine Quellenangabe ist Pflicht', () => {
    const withoutSource = validateSignalInput({
      signalType: 'seeks_subcontractor',
      sourceType: null,
      sourceName: null,
      sourceUrl: null,
      observedAt: isoDay(0),
      confidence: 'low',
      partnerCompanyId: null,
      companyNameRaw: 'Beispiel Bau AG',
    });
    expect(withoutSource.valid).toBe(false);
    expect(withoutSource.messages.map((message) => message.field)).toContain('sourceType');

    const withSource = validateSignalInput({
      signalType: 'seeks_subcontractor',
      sourceType: 'website',
      sourceName: 'Karriereseite',
      sourceUrl: null,
      observedAt: isoDay(0),
      confidence: 'low',
      partnerCompanyId: null,
      companyNameRaw: 'Beispiel Bau AG',
    });
    expect(withSource.valid).toBe(true);
  });

  it('59 — hohe Konfidenz verlangt eine belegbare Quelle', () => {
    const result = validateSignalInput({
      signalType: 'seeks_subcontractor',
      sourceType: 'phone_call',
      sourceName: null,
      sourceUrl: null,
      observedAt: isoDay(0),
      confidence: 'high',
      partnerCompanyId: null,
      companyNameRaw: 'Beispiel Bau AG',
    });
    expect(result.valid).toBe(false);
  });

  it('60 — ein anonymes Signal ist nicht verwertbar', () => {
    const result = validateSignalInput({
      signalType: 'seeks_subcontractor',
      sourceType: 'website',
      sourceName: 'Quelle',
      sourceUrl: null,
      observedAt: isoDay(0),
      confidence: 'low',
      partnerCompanyId: null,
      companyNameRaw: null,
    });
    expect(result.valid).toBe(false);
    expect(result.messages.map((message) => message.field)).toContain('companyNameRaw');
  });

  it('61 — ein Signal lässt sich als relevant markieren', () => {
    expect(applySignalAction({ status: 'new' }, 'mark_relevant').status).toBe('relevant');
    expect(applySignalAction({ status: 'relevant' }, 'mark_contacted').status).toBe(
      'contacted',
    );
  });

  it('62 — ein Signal lässt sich verwerfen, aber nicht doppelt', () => {
    expect(applySignalAction({ status: 'new' }, 'discard').status).toBe('discarded');
    expect(() => applySignalAction({ status: 'discarded' }, 'discard')).toThrow(
      SignalRuleError,
    );
  });

  it('63 — ein erledigtes Signal wird nicht zurückgesetzt', () => {
    expect(() => applySignalAction({ status: 'done' }, 'mark_reviewed')).toThrow(
      SignalRuleError,
    );
  });

  it('64 — eine Wiedervorlage lässt sich setzen', async () => {
    const { store } = createStore();
    const signal = await store.saveSignal(signalInput());
    const updated = await store.saveSignal({
      ...signalInput(),
      id: signal!.id,
      followUpAt: isoDay(14),
      nextAction: 'Rückruf vereinbaren',
    });
    expect(updated?.followUpAt).toBe(isoDay(14));
    expect(updated?.nextAction).toBe('Rückruf vereinbaren');
  });

  it('65 — ein abgelaufenes Signal zählt nicht mehr als aktuell', async () => {
    const { store } = createStore();
    const company = await store.createCompany(companyInput('Beispiel Bau AG'));

    await store.saveSignal(
      signalInput({
        partnerCompanyId: company.id,
        observedAt: isoDay(-60),
        validUntil: isoDay(-1),
      }),
    );

    expect(
      isSignalExpired({ validUntil: isoDay(-1), status: 'new' }),
    ).toBe(true);
    expect(
      countsAsOpenDemand({
        signalType: 'seeks_security',
        status: 'new',
        validUntil: isoDay(-1),
      }),
    ).toBe(false);

    // The company therefore no longer counts as looking for a subcontractor.
    const list = await store.listCompanies(ORG_A, parsePartnerQuery({ demand: 'true' }));
    expect(list.total).toBe(0);
  });

  it('66 — ein Hinweis bleibt ein Hinweis', () => {
    expect(isDemandSignal('seeks_security')).toBe(true);
    expect(isDemandSignal('new_datacenter')).toBe(false);

    const suggestion = suggestDirectionFromSignal(
      { signalType: 'seeks_security' },
      'can_work_for_us',
    );
    // A suggestion, explicitly flagged as not applied.
    expect(suggestion.changed).toBe(true);
    expect(suggestion.reason).toContain('nicht automatisch');
  });

  it('67 — ein Signal einer fremden Organisation ist nicht lesbar', async () => {
    const { store } = createStore();
    const signal = await store.saveSignal(signalInput());
    expect(await store.findSignalById(ORG_B, signal!.id)).toBeNull();
  });
});

// ---------------------------------------------------------------------------

describe('Nachunternehmerkette', () => {
  async function chainScenario() {
    const { store } = createStore();
    const a = await store.createCompany(companyInput('Muster Alpha GmbH'));
    const b = await store.createCompany(companyInput('Beispiel Beta GmbH'));
    const c = await store.createCompany(companyInput('Muster Gamma GmbH'));
    return { store, a, b, c };
  }

  function assignmentInput(partnerCompanyId: string, overrides: Record<string, unknown> = {}) {
    return {
      organizationId: ORG_A,
      partnerCompanyId,
      referenceProjectId: null,
      needId: null,
      role: 'subcontractor' as const,
      parentAssignmentId: null,
      contractPartnerCompanyId: null,
      scope: 'Musterleistung',
      staffCount: 5,
      startDate: isoDay(0),
      endDate: isoDay(180),
      furtherSubcontractingAllowed: 'allowed' as const,
      status: 'active' as const,
      internalRating: null,
      note: null,
      createdBy: USER,
      ...overrides,
    };
  }

  it('68 — eine direkte Zuordnung liegt auf Ebene 1', async () => {
    const { store, a } = await chainScenario();
    const assignment = await store.saveAssignment(assignmentInput(a.id));
    expect(assignment?.chainLevel).toBe(1);
    expect(assignment?.parentAssignmentId).toBeNull();
  });

  it('69 — eine zweite Kettenebene wird korrekt errechnet', async () => {
    const { store, a, b } = await chainScenario();
    const first = await store.saveAssignment(assignmentInput(a.id));
    const second = await store.saveAssignment(
      assignmentInput(b.id, { parentAssignmentId: first!.id, role: 'sub_subcontractor' }),
    );

    expect(second?.chainLevel).toBe(2);
  });

  it('70 — ein Kreis wird verhindert', async () => {
    const { store, a, b } = await chainScenario();
    const first = await store.saveAssignment(assignmentInput(a.id));
    const second = await store.saveAssignment(
      assignmentInput(b.id, { parentAssignmentId: first!.id }),
    );

    await expect(
      store.saveAssignment(
        assignmentInput(a.id, { id: first!.id, parentAssignmentId: second!.id }),
      ),
    ).rejects.toThrow(ChainRuleError);
  });

  it('71 — eine Zuordnung darf sich nicht selbst übergeordnet sein', () => {
    expect(() =>
      validateChainLink({
        assignmentId: 'x',
        parentAssignmentId: 'x',
        existing: [],
      }),
    ).toThrow(ChainRuleError);
  });

  it('72 — die maximale Kettentiefe wird eingehalten', () => {
    const existing = Array.from({ length: MAX_CHAIN_DEPTH }, (_, index) => ({
      id: `a${index + 1}`,
      parentAssignmentId: index === 0 ? null : `a${index}`,
      chainLevel: index + 1,
      partnerCompanyId: 'c1',
    }));

    expect(() =>
      validateChainLink({
        assignmentId: null,
        parentAssignmentId: `a${MAX_CHAIN_DEPTH}`,
        existing,
      }),
    ).toThrow(ChainRuleError);

    // One level less is still fine.
    expect(
      validateChainLink({
        assignmentId: null,
        parentAssignmentId: `a${MAX_CHAIN_DEPTH - 1}`,
        existing,
      }).chainLevel,
    ).toBe(MAX_CHAIN_DEPTH);
  });

  it('73 — ein fremder Elternknoten gilt als nicht vorhanden', () => {
    expect(() =>
      validateChainLink({
        assignmentId: null,
        parentAssignmentId: 'fremd',
        existing: [],
      }),
    ).toThrow('existiert nicht');
  });

  it('74 — ein nachträglich gesperrter Partner bleibt in der Kette sichtbar', async () => {
    const { store, a, b } = await chainScenario();
    const first = await store.saveAssignment(assignmentInput(a.id));
    await store.saveAssignment(assignmentInput(b.id, { parentAssignmentId: first!.id }));

    await store.updateCompany(ORG_A, b.id, {
      isBlocked: true,
      blockedReason: 'Musterbegründung',
    });

    const tree = await store.listAssignments(ORG_A, {});
    const flat = flattenChain(tree);
    const blocked = flat.find((entry) => entry.node.assignment.partnerCompanyId === b.id);

    expect(blocked).toBeDefined();
    expect(blocked?.node.companyIsBlocked).toBe(true);
  });

  it('75 — weitere Untervergabe wird respektiert', () => {
    expect(mayAddChildAssignment({ furtherSubcontractingAllowed: 'allowed' }).allowed).toBe(
      true,
    );
    expect(
      mayAddChildAssignment({ furtherSubcontractingAllowed: 'not_allowed' }).allowed,
    ).toBe(false);
    // "Unknown" is not permission.
    expect(mayAddChildAssignment({ furtherSubcontractingAllowed: 'unknown' }).allowed).toBe(
      false,
    );
  });

  it('76 — ein verwaister Knoten geht nicht verloren', () => {
    const tree = buildChainTree([
      {
        assignment: {
          id: 'a2',
          organizationId: ORG_A,
          partnerCompanyId: 'c2',
          referenceProjectId: null,
          needId: null,
          role: 'sub_subcontractor',
          // Parent is not part of the set handed in.
          parentAssignmentId: 'missing',
          chainLevel: 2,
          contractPartnerCompanyId: null,
          scope: null,
          staffCount: null,
          startDate: null,
          endDate: null,
          furtherSubcontractingAllowed: 'unknown',
          status: 'active',
          internalRating: null,
          note: null,
          createdBy: null,
          createdAt: isoDay(0),
          updatedAt: isoDay(0),
        },
        companyName: 'Muster Waise GmbH',
        companyIsBlocked: false,
      },
    ]);

    expect(tree).toHaveLength(1);
  });

  it('77 — eine Zuordnung für einen fremden Partner wird abgelehnt', async () => {
    const { store, a } = await chainScenario();
    const attempt = await store.saveAssignment({
      ...assignmentInput(a.id),
      organizationId: ORG_B,
    });
    expect(attempt).toBeNull();
  });
});
