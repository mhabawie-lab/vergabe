import { describe, expect, it } from 'vitest';
import {
  classifyReferenceProject,
  proposeServicesFromName,
} from '@/modules/references/classification';

/**
 * These tests guard the most consequential rule of phase 2: the system must
 * not claim experience the company cannot evidence. Restraint is the feature.
 */
describe('Vorsichtige Leistungserkennung', () => {
  it.each([
    ['Paramedic Einsatz Nord', 'paramedic'],
    ['Security Musterwerk', 'security'],
    ['Cleaning Bürogebäude', 'cleaning'],
    ['Lager Beispielweg', 'warehouse'],
  ])('schlägt für „%s" die Kategorie %s vor', (name, expected) => {
    const proposals = proposeServicesFromName(name);
    expect(proposals.map((proposal) => proposal.serviceCategory)).toContain(expected);
  });

  it('erkennt Begriffe unabhängig von der Groß- und Kleinschreibung', () => {
    expect(proposeServicesFromName('SECURITY NORD')[0]?.serviceCategory).toBe('security');
    expect(proposeServicesFromName('security nord')[0]?.serviceCategory).toBe('security');
  });

  it.each([
    'Objekt 47 Nordzufahrt',
    'Halle Nord',
    'Verwaltungsgebäude Süd',
    'Standort Beispielweg 12',
    'BSP-0006',
  ])('lässt „%s" bei unknown, statt eine Leistung zu erfinden', (name) => {
    const services = classifyReferenceProject({ projectName: name, objectType: null });
    expect(services).toHaveLength(1);
    expect(services[0]?.serviceCategory).toBe('unknown');
  });

  it('leitet aus der Objektart Datacenter keine Leistung ab', () => {
    const services = classifyReferenceProject({
      projectName: 'Objekt Beispielpark',
      objectType: 'Datacenter',
    });
    expect(services[0]?.serviceCategory).toBe('unknown');
  });

  it('vergibt niemals automatisch Bauhelfer oder Sicherheitsdienst', () => {
    // The German words must not trigger a classification: only the explicit
    // rule terms do, and neither of these is one.
    for (const name of ['Bauhelfer Einsatz', 'Sicherheitsdienst Musterstadt']) {
      const services = classifyReferenceProject({ projectName: name, objectType: null });
      expect(services[0]?.serviceCategory).toBe('unknown');
    }
  });

  it('kennzeichnet jeden Vorschlag als unbestätigt und nennt die Regel', () => {
    const [proposal] = classifyReferenceProject({
      projectName: 'Security Musterwerk',
      objectType: null,
    });

    expect(proposal?.confirmedByUser).toBe(false);
    expect(proposal?.classificationSource).toBe('name_rule');
    expect(proposal?.ruleId).toBe('name:security');
    expect(proposal?.classificationConfidence).toBeGreaterThan(0);
    expect(proposal?.classificationConfidence).toBeLessThanOrEqual(1);
    expect(proposal?.reason).toContain('security');
  });

  it('gibt der unknown-Zuordnung die Konfidenz 0', () => {
    const [proposal] = classifyReferenceProject({
      projectName: 'Objekt 12',
      objectType: null,
    });
    expect(proposal?.classificationConfidence).toBe(0);
  });

  it('erlaubt mehrere Vorschläge für einen Namen', () => {
    const proposals = proposeServicesFromName('Security und Cleaning Musterwerk');
    expect(proposals.map((proposal) => proposal.serviceCategory).sort()).toEqual([
      'cleaning',
      'security',
    ]);
  });
});
