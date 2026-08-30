/**
 * Anwendungsseitige Auditeinträge.
 *
 * audit_log trug lange nur eine SELECT-Richtlinie. Einträge aus Triggern
 * entstehen in `security definer`-Funktionen und umgehen die
 * Zeilensicherheit — die funktionierten immer. Alles, was die Anwendung mit
 * der Sitzung der angemeldeten Person schrieb, wurde dagegen abgewiesen und
 * riss die ganze Aktion mit: Dokument-Upload, Kundenanlage, Partnerimport.
 *
 * Der prozessinterne Speicher kennt keine Zeilensicherheit, deshalb war der
 * Fehler erst gegen eine echte Datenbank sichtbar.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const policy = readFileSync('supabase/migrations/0017_audit_log_insert_policy.sql', 'utf8');
const route = readFileSync('src/app/api/v1/documents/route.ts', 'utf8');

describe('Auditprotokoll', () => {
  it('1 — es gibt eine INSERT-Richtlinie', () => {
    expect(policy).toContain('create policy audit_log_insert on public.audit_log');
    expect(policy).toContain('for insert');
  });

  it('2 — nur für die eigene Organisation', () => {
    expect(policy).toContain('public.is_org_member(organization_id)');
    expect(policy).toContain('organization_id is not null');
  });

  it('3 — nur unter der eigenen Benutzerkennung', () => {
    // Sonst liesse sich ein Eintrag im Namen einer anderen Person erzeugen.
    expect(policy).toContain('user_id = auth.uid()');
  });

  it('4 — das Protokoll bleibt anfügend', () => {
    // Keine update- oder delete-Richtlinie, hier so wenig wie anderswo.
    expect(policy).not.toMatch(/for\s+(update|delete|all)/);
  });
});

describe('Upload und Protokoll gehören zusammen', () => {
  it('5 — ein fehlgeschlagener Auditeintrag räumt das Dokument wieder ab', () => {
    // Sonst bliebe eine Datei im Bucket, zu der niemand weiss, wer sie
    // abgelegt hat.
    expect(route).toContain('catch (auditError)');
    expect(route).toContain('store\n        .remove(');
    expect(route).toContain('throw auditError');
  });
});
