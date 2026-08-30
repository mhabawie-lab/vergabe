-- 0017_audit_log_insert_policy.sql
-- Anwendungsseitige Auditeinträge zulassen.
--
-- Additiv: keine bestehende Richtlinie wird geändert oder entfernt.
--
-- audit_log trug bisher nur eine SELECT-Richtlinie. Einträge, die von
-- Datenbanktriggern stammen, entstehen in `security definer`-Funktionen und
-- umgehen die Zeilensicherheit — die haben immer funktioniert. Alles, was die
-- Anwendung mit der Sitzung der angemeldeten Person schreibt, wurde dagegen
-- abgewiesen:
--
--   new row violates row-level security policy for table "audit_log"
--
-- Betroffen waren Dokument-Upload, Kundenanlage, Partneranlage und der
-- Partnerimport — also genau die Vorgänge, die laut CLAUDE.md § 10
-- protokolliert werden müssen. Das Ergebnis war kein stiller Verlust des
-- Protokolls, sondern ein Abbruch der ganzen Aktion; sichtbar wurde es erst
-- gegen eine echte Datenbank, weil der prozessinterne Speicher keine
-- Zeilensicherheit kennt.
--
-- Die Richtlinie bleibt eng:
--   * nur für die eigene Organisation,
--   * nur unter der eigenen Benutzerkennung — niemand kann einen Eintrag
--     im Namen einer anderen Person erzeugen,
--   * nur einfügen. update und delete bleiben für alle gesperrt, das
--     Protokoll bleibt also anfügend (CLAUDE.md § 5).

create policy audit_log_insert on public.audit_log
  for insert
  to authenticated
  with check (
    organization_id is not null
    and public.is_org_member(organization_id)
    and user_id = auth.uid()
  );

comment on policy audit_log_insert on public.audit_log is
  'Members may append entries for their own organisation under their own user id. No update or delete policy exists, so the log stays append-only.';
