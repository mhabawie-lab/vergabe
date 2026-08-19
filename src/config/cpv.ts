/**
 * CPV (Common Procurement Vocabulary) catalogue.
 *
 * Phase 1 ships a curated subset covering the launch sectors so the CPV
 * filter and CPV search are usable. The full official catalogue (~9,500
 * codes) is imported into its own table in a later phase; consumers should
 * therefore treat this list as a lookup helper, not as the source of truth.
 */

export interface CpvEntry {
  code: string;
  label: string;
}

export const CPV_CATALOGUE: readonly CpvEntry[] = [
  { code: '50700000', label: 'Reparatur und Wartung von Gebäudeanlagen' },
  { code: '72500000', label: 'Computereinrichtungen und -dienstleistungen' },
  { code: '75251110', label: 'Brandverhütung' },
  { code: '79710000', label: 'Sicherheitsdienste' },
  { code: '79711000', label: 'Überwachung von Alarmanlagen' },
  { code: '79713000', label: 'Wach- und Aufsichtsdienste' },
  { code: '79714000', label: 'Überwachungsdienste' },
  { code: '79715000', label: 'Streifendienste' },
  { code: '79992000', label: 'Empfangsdienste' },
  { code: '79993000', label: 'Gebäude- und Anlagenverwaltung' },
  { code: '85311000', label: 'Soziale Betreuung mit Unterbringung' },
  { code: '90910000', label: 'Reinigungsdienste' },
  { code: '90911200', label: 'Gebäudereinigung' },
  { code: '90919200', label: 'Büroreinigung' },
  { code: '98341000', label: 'Unterbringungsdienste' },
  { code: '98341120', label: 'Pförtnerdienste' },
] as const;

const CPV_BY_CODE = new Map<string, CpvEntry>(
  CPV_CATALOGUE.map((entry) => [entry.code, entry]),
);

export function getCpvLabel(code: string): string {
  return CPV_BY_CODE.get(code)?.label ?? 'Unbekannter CPV-Code';
}

export function findCpvEntries(query: string): CpvEntry[] {
  const needle = query.trim().toLowerCase();
  if (needle.length === 0) return [...CPV_CATALOGUE];
  return CPV_CATALOGUE.filter(
    (entry) =>
      entry.code.startsWith(needle) || entry.label.toLowerCase().includes(needle),
  );
}
