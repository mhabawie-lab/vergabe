/**
 * Synthetic payloads for the DEMO source.
 *
 * These are NOT real tenders. Every record carries `demo: true`, uses
 * invented authorities in fictional places ("Musterstadt", "Beispielkreis")
 * and a non-routable `demo.sichervergabe.invalid` URL, so it can never be
 * mistaken for live data. The pipeline additionally flags every derived
 * record `is_demo = true` (CLAUDE.md § Daten-Integrität).
 *
 * The payload shape deliberately mirrors a typical German procurement portal
 * export — German field names, `DD.MM.YYYY` dates, `1.250.000,00 EUR` money
 * strings — and not the internal model. The mapper does the real conversion.
 */

/** The raw record shape the demo source emits. */
export interface DemoTenderPayload {
  demo: true;
  vergabe_id: string;
  bezeichnung: string;
  kurzbeschreibung: string;
  leistungsbeschreibung: string;
  aktenzeichen: string;
  vergabeart: string;
  leistungsart: string;
  cpv: string[];
  branchen: string[];
  auftraggeber: {
    id: string;
    name: string;
    typ: string;
    strasse: string;
    plz: string;
    ort: string;
    bundesland: string;
    land: string;
    email: string;
    telefon: string;
  };
  erfuellungsort: {
    ort: string;
    plz: string;
    bundesland: string;
    land: string;
    nuts: string[];
  };
  veroeffentlicht_am: string;
  angebotsfrist: string;
  bieterfragen_bis: string;
  bindefrist: string;
  vertragsbeginn: string;
  vertragsende: string;
  laufzeit_monate: number;
  geschaetzter_auftragswert: string;
  status: string;
  lose: Array<{
    los_nr: string;
    titel: string;
    beschreibung: string;
    wert: string;
    cpv: string[];
  }>;
  eignungskriterien: string[];
  personalanforderungen: string[];
  unterlagen: Array<{ titel: string; typ: string; groesse_kb: number }>;
  quelle_url: string;
  /** Present only when status is `vergeben`. */
  zuschlag?: {
    zuschlag_id: string;
    auftragnehmer: string;
    auftragnehmer_ort: string;
    zuschlagswert: string;
    zuschlag_am: string;
    anzahl_bieter: number;
  };
}

interface AuthoritySpec {
  id: string;
  name: string;
  typ: string;
  strasse: string;
  plz: string;
  ort: string;
  bundesland: string;
}

const AUTHORITIES: readonly AuthoritySpec[] = [
  {
    id: 'DEMO-AG-001',
    name: 'Stadt Musterstadt — Zentrale Vergabestelle (DEMO)',
    typ: 'Kommunale Vergabestelle',
    strasse: 'Rathausplatz 1',
    plz: '40210',
    ort: 'Musterstadt',
    bundesland: 'NW',
  },
  {
    id: 'DEMO-AG-002',
    name: 'Landkreis Beispielkreis — Amt für Gebäudewirtschaft (DEMO)',
    typ: 'Landkreis',
    strasse: 'Kreishausstraße 14',
    plz: '30159',
    ort: 'Beispielkreis',
    bundesland: 'NI',
  },
  {
    id: 'DEMO-AG-003',
    name: 'Musterland Immobilienbetrieb AöR (DEMO)',
    typ: 'Anstalt öffentlichen Rechts',
    strasse: 'Verwaltungsring 8',
    plz: '80331',
    ort: 'Beispielhausen',
    bundesland: 'BY',
  },
  {
    id: 'DEMO-AG-004',
    name: 'Beispiel Rechenzentrum Betriebs GmbH (DEMO)',
    typ: 'Öffentliches Unternehmen',
    strasse: 'Serverallee 42',
    plz: '60313',
    ort: 'Datenstadt',
    bundesland: 'HE',
  },
  {
    id: 'DEMO-AG-005',
    name: 'Bezirksregierung Musterbezirk (DEMO)',
    typ: 'Landesbehörde',
    strasse: 'Behördenweg 3',
    plz: '20095',
    ort: 'Musterhafen',
    bundesland: 'HH',
  },
  {
    id: 'DEMO-AG-006',
    name: 'Klinikverbund Beispielstadt gGmbH (DEMO)',
    typ: 'Öffentlicher Auftraggeber (Gesundheit)',
    strasse: 'Klinikstraße 22',
    plz: '01067',
    ort: 'Beispielstadt',
    bundesland: 'SN',
  },
];

interface TenderSpec {
  /** Days relative to today. Negative = in the past. */
  publishedOffset: number;
  deadlineOffset: number;
  authorityIndex: number;
  title: string;
  summary: string;
  description: string;
  procurementCategory: string;
  procedure: string;
  cpv: string[];
  sectors: string[];
  city: string;
  postalCode: string;
  regionCode: string;
  nuts: string[];
  valueEur: number;
  durationMonths: number;
  status: string;
  lots: Array<{ title: string; description: string; valueEur: number; cpv: string[] }>;
  eligibility: string[];
  staff: string[];
  documents: Array<{ titel: string; typ: string; groesse_kb: number }>;
  /** Set for specs whose status is `vergeben`. */
  award?: {
    winner: string;
    winnerCity: string;
    valueEur: number;
    /** Days relative to today; the award always precedes it. */
    awardedOffset: number;
    bidders: number;
  };
}

const TENDER_SPECS: readonly TenderSpec[] = [
  {
    publishedOffset: -4,
    deadlineOffset: 24,
    authorityIndex: 3,
    title: 'Rund-um-die-Uhr-Bewachung eines Hochverfügbarkeitsrechenzentrums',
    summary:
      'Sicherheitsdienstleistungen im 24/7-Schichtbetrieb für zwei Rechenzentrumsstandorte inklusive Zutrittskontrolle und Leitstellenbetrieb.',
    description:
      'Gegenstand der Ausschreibung ist die ständig besetzte Bewachung von zwei Rechenzentrumsstandorten im 24/7-Betrieb. Der Auftragnehmer stellt an beiden Standorten je zwei Sicherheitsmitarbeitende pro Schicht sowie eine ständig besetzte Sicherheitsleitstelle. Zum Leistungsumfang gehören Zutritts- und Besucherkontrolle nach Sicherheitszonenkonzept, Begleitung von Fremdfirmen in den Technikbereichen, Alarmverfolgung und Erstintervention, Streifengänge nach dokumentiertem Streifenplan sowie die Führung des elektronischen Wachbuchs. Die Anforderungen an Verfügbarkeit und Dokumentation richten sich nach dem Sicherheitskonzept des Auftraggebers gemäß BSI IT-Grundschutz.',
    procurementCategory: 'dienstleistung',
    procedure: 'offenes_verfahren',
    cpv: ['79713000', '79711000', '72500000'],
    sectors: ['data_center', 'security_services', 'property_protection'],
    city: 'Datenstadt',
    postalCode: '60313',
    regionCode: 'HE',
    nuts: ['DE71'],
    valueEur: 4_280_000,
    durationMonths: 48,
    status: 'veroeffentlicht',
    lots: [
      {
        title: 'Los 1 — Standort Datenstadt Nord',
        description: 'Bewachung und Leitstellenbetrieb Standort Nord, 24/7.',
        valueEur: 2_340_000,
        cpv: ['79713000'],
      },
      {
        title: 'Los 2 — Standort Datenstadt Süd',
        description: 'Bewachung und Zutrittskontrolle Standort Süd, 24/7.',
        valueEur: 1_940_000,
        cpv: ['79713000'],
      },
    ],
    eligibility: [
      'Bewachungserlaubnis nach § 34a GewO',
      'Zertifizierung nach DIN 77200-1 (Sicherungsdienstleistungen)',
      'Nachweis einer Betriebshaftpflichtversicherung über mindestens 5 Mio. EUR',
      'Drei vergleichbare Referenzen aus dem Rechenzentrumsumfeld der letzten fünf Jahre',
      'Zertifiziertes Informationssicherheitsmanagement nach ISO/IEC 27001',
    ],
    staff: [
      'Sachkundeprüfung nach § 34a Abs. 1a GewO für alle eingesetzten Kräfte',
      'Erweiterte Sicherheitsüberprüfung (Ü2) für Leitstellenpersonal',
      'Objektleitung mit Meisterbrief Schutz und Sicherheit',
      'Nachweis Erste Hilfe, nicht älter als 24 Monate',
    ],
    documents: [
      { titel: 'Leistungsverzeichnis', typ: 'pdf', groesse_kb: 842 },
      { titel: 'Vertragsentwurf Rahmenvereinbarung', typ: 'pdf', groesse_kb: 391 },
      { titel: 'Sicherheitskonzept (Anlage 3)', typ: 'pdf', groesse_kb: 1_204 },
      { titel: 'Preisblatt', typ: 'xlsx', groesse_kb: 68 },
    ],
  },
  {
    publishedOffset: -2,
    deadlineOffset: 12,
    authorityIndex: 0,
    title: 'Objektschutz und Empfangsdienst für Verwaltungsgebäude der Stadtverwaltung',
    summary:
      'Empfangs-, Pforten- und Objektschutzdienste an vier Verwaltungsstandorten, werktags 06:00–20:00 Uhr.',
    description:
      'Die Stadt Musterstadt schreibt Empfangs- und Objektschutzdienstleistungen für vier Verwaltungsgebäude aus. Der Auftragnehmer besetzt die Empfangstresen werktags von 06:00 bis 20:00 Uhr. Zum Leistungsumfang gehören Besucherempfang und -anmeldung, Ausgabe und Rücknahme von Besucherausweisen, Schlüsselverwaltung, Telefonvermittlung, Postannahme sowie Schließ- und Kontrollgänge zu Dienstschluss. Zusätzlich ist ein Deeskalationsdienst für den Publikumsbereich des Bürgerbüros zu stellen.',
    procurementCategory: 'dienstleistung',
    procedure: 'offenes_verfahren',
    cpv: ['79992000', '98341120', '79713000'],
    sectors: ['reception_gate_services', 'property_protection', 'security_services'],
    city: 'Musterstadt',
    postalCode: '40210',
    regionCode: 'NW',
    nuts: ['DEA1'],
    valueEur: 1_640_000,
    durationMonths: 36,
    status: 'veroeffentlicht',
    lots: [],
    eligibility: [
      'Bewachungserlaubnis nach § 34a GewO',
      'Zwei Referenzen über Empfangsdienste im öffentlichen Bereich',
      'Tariftreue- und Mindestlohnerklärung nach TVgG NRW',
    ],
    staff: [
      'Unterrichtungsnachweis nach § 34a GewO',
      'Deeskalationstraining, nachgewiesen für mindestens 50 % der Kräfte',
      'Verhandlungssicheres Deutsch (Niveau B2)',
    ],
    documents: [
      { titel: 'Leistungsbeschreibung Empfangsdienst', typ: 'pdf', groesse_kb: 512 },
      { titel: 'Standortübersicht mit Dienstplänen', typ: 'pdf', groesse_kb: 233 },
      { titel: 'Eigenerklärung Eignung', typ: 'docx', groesse_kb: 44 },
    ],
  },
  {
    publishedOffset: -9,
    deadlineOffset: 6,
    authorityIndex: 1,
    title: 'Baustellenbewachung Neubau Kreisverwaltung — Bauabschnitt 2',
    summary:
      'Nächtliche Baustellenbewachung inklusive Streifendienst und mobiler Videoüberwachung für 18 Monate.',
    description:
      'Für den zweiten Bauabschnitt des Verwaltungsneubaus ist die Bewachung der Baustelle außerhalb der Arbeitszeiten sicherzustellen. Der Auftragnehmer stellt eine Nachtwache von 18:00 bis 06:00 Uhr sowie durchgehende Bewachung an Wochenenden und Feiertagen. Ergänzend sind vier mobile Videoüberwachungstürme zu stellen, zu betreiben und an eine zertifizierte Notruf- und Serviceleitstelle aufzuschalten. Die Alarmverfolgung erfolgt durch einen Interventionsdienst mit einer Eintreffzeit von maximal 20 Minuten.',
    procurementCategory: 'dienstleistung',
    procedure: 'nichtoffenes_verfahren',
    cpv: ['79714000', '79715000'],
    sectors: ['construction_site_security', 'security_services'],
    city: 'Beispielkreis',
    postalCode: '30159',
    regionCode: 'NI',
    nuts: ['DE92'],
    valueEur: 486_000,
    durationMonths: 18,
    status: 'veroeffentlicht',
    lots: [],
    eligibility: [
      'Bewachungserlaubnis nach § 34a GewO',
      'Aufschaltung auf eine nach DIN EN 50518 zertifizierte Notruf- und Serviceleitstelle',
      'Nachweis Interventionsdienst mit Eintreffzeit ≤ 20 Minuten',
    ],
    staff: [
      'Sachkundeprüfung nach § 34a GewO für den Interventionsdienst',
      'Einweisung in die Baustellenordnung vor Einsatzbeginn',
    ],
    documents: [
      { titel: 'Leistungsverzeichnis Baustellenbewachung', typ: 'pdf', groesse_kb: 388 },
      { titel: 'Baustellenplan Bauabschnitt 2', typ: 'pdf', groesse_kb: 2_140 },
    ],
  },
  {
    publishedOffset: -1,
    deadlineOffset: 31,
    authorityIndex: 4,
    title: 'Betreuungs- und Sicherheitsdienstleistungen in Gemeinschaftsunterkünften',
    summary:
      'Rund-um-die-Uhr-Betreuung und Sicherheitsdienst für drei Gemeinschaftsunterkünfte mit insgesamt 640 Plätzen.',
    description:
      'Ausgeschrieben werden Sicherheits- und Betreuungsdienstleistungen für drei Gemeinschaftsunterkünfte. Der Auftragnehmer stellt einen 24/7-Sicherheitsdienst, die Zugangskontrolle, die Begleitung der Hausordnung, Konfliktprävention und Deeskalation sowie die Unterstützung des Sozialdienstes bei der Belegungsverwaltung. Interkulturelle Kompetenz und mehrsprachiges Personal sind zwingend erforderlich. Ein Gewaltschutzkonzept nach den Mindeststandards des BMFSFJ ist Bestandteil des Angebots.',
    procurementCategory: 'dienstleistung',
    procedure: 'verhandlungsverfahren',
    cpv: ['85311000', '98341000', '79713000'],
    sectors: ['refugee_accommodation', 'security_services'],
    city: 'Musterhafen',
    postalCode: '20095',
    regionCode: 'HH',
    nuts: ['DE60'],
    valueEur: 3_120_000,
    durationMonths: 24,
    status: 'veroeffentlicht',
    lots: [
      {
        title: 'Los 1 — Unterkunft Hafenstraße (280 Plätze)',
        description: 'Sicherheits- und Betreuungsdienst 24/7.',
        valueEur: 1_380_000,
        cpv: ['85311000'],
      },
      {
        title: 'Los 2 — Unterkünfte Nordring und Westweg (360 Plätze)',
        description: 'Sicherheits- und Betreuungsdienst 24/7 an zwei Standorten.',
        valueEur: 1_740_000,
        cpv: ['85311000'],
      },
    ],
    eligibility: [
      'Bewachungserlaubnis nach § 34a GewO',
      'Gewaltschutzkonzept nach den Mindeststandards des BMFSFJ',
      'Zwei Referenzen über den Betrieb von Gemeinschaftsunterkünften',
      'Erweitertes Führungszeugnis nach § 30a BZRG für das gesamte eingesetzte Personal',
    ],
    staff: [
      'Sachkundeprüfung nach § 34a GewO',
      'Nachgewiesene interkulturelle Schulung',
      'Mehrsprachiges Personal: Arabisch, Ukrainisch, Englisch',
      'Deeskalationstraining, jährlich aufzufrischen',
    ],
    documents: [
      { titel: 'Leistungsbeschreibung Unterkünfte', typ: 'pdf', groesse_kb: 964 },
      { titel: 'Gewaltschutzkonzept — Rahmenvorgaben', typ: 'pdf', groesse_kb: 610 },
      { titel: 'Preisblatt je Los', typ: 'xlsx', groesse_kb: 82 },
      { titel: 'Bewerbungsbedingungen', typ: 'pdf', groesse_kb: 147 },
    ],
  },
  {
    publishedOffset: -14,
    deadlineOffset: 3,
    authorityIndex: 5,
    title: 'Brandsicherheitswachdienst für Veranstaltungs- und Klinikbereiche',
    summary:
      'Gestellung von Brandsicherheitswachen für Veranstaltungen sowie bei Ausfall von Brandmeldeanlagen.',
    description:
      'Der Klinikverbund schreibt die Gestellung von Brandsicherheitswachen aus. Der Auftrag umfasst die Besetzung von Brandsicherheitswachen bei Veranstaltungen im Auditorium, die Stellung von Ersatzwachen bei Störung oder Abschaltung von Brandmeldeanlagen sowie Brandwachen bei feuergefährlichen Arbeiten im laufenden Klinikbetrieb. Die Abrufe erfolgen einzelfallbezogen mit einer Vorlaufzeit von mindestens 24 Stunden; für Störungsfälle ist eine Reaktionszeit von vier Stunden einzuhalten.',
    procurementCategory: 'dienstleistung',
    procedure: 'rahmenvereinbarung',
    cpv: ['75251110', '79713000'],
    sectors: ['fire_watch', 'security_services'],
    city: 'Beispielstadt',
    postalCode: '01067',
    regionCode: 'SN',
    nuts: ['DED2'],
    valueEur: 295_000,
    durationMonths: 36,
    status: 'veroeffentlicht',
    lots: [],
    eligibility: [
      'Nachweis über die Gestellung von Brandsicherheitswachen gemäß Landesbauordnung',
      'Reaktionszeit von maximal vier Stunden im Störungsfall',
      'Betriebshaftpflichtversicherung über mindestens 3 Mio. EUR',
    ],
    staff: [
      'Ausbildung zur Brandschutzhelferin bzw. zum Brandschutzhelfer nach ASR A2.2',
      'Feuerwehrtechnische Grundausbildung (mindestens Truppmann/Truppfrau)',
      'Ortskenntnis der Klinikstandorte, nachzuweisen durch Einweisung',
    ],
    documents: [
      { titel: 'Rahmenvereinbarung Brandsicherheitswache', typ: 'pdf', groesse_kb: 276 },
      { titel: 'Abrufkatalog mit Einsatzarten', typ: 'pdf', groesse_kb: 158 },
    ],
  },
  {
    publishedOffset: -6,
    deadlineOffset: 18,
    authorityIndex: 2,
    title: 'Unterhaltsreinigung für 22 Landesliegenschaften',
    summary:
      'Unterhalts-, Glas- und Grundreinigung für 22 Liegenschaften mit rund 148.000 m² Reinigungsfläche.',
    description:
      'Der Immobilienbetrieb schreibt die Unterhaltsreinigung für 22 Liegenschaften aus. Der Leistungsumfang umfasst die tägliche Unterhaltsreinigung von Büro-, Sanitär- und Verkehrsflächen, die Glas- und Rahmenreinigung zweimal jährlich, die jährliche Grundreinigung aller Hartbodenflächen sowie den Winterdienst auf den Zuwegungen. Die Reinigung erfolgt außerhalb der Kernarbeitszeiten. Der Auftraggeber stellt Reinigungsmittelräume und Wasseranschlüsse bereit; Verbrauchsmaterial und Geräte sind vom Auftragnehmer zu stellen.',
    procurementCategory: 'dienstleistung',
    procedure: 'offenes_verfahren',
    cpv: ['90910000', '90911200', '90919200'],
    sectors: ['cleaning', 'facility_management'],
    city: 'Beispielhausen',
    postalCode: '80331',
    regionCode: 'BY',
    nuts: ['DE21'],
    valueEur: 5_760_000,
    durationMonths: 48,
    status: 'veroeffentlicht',
    lots: [
      {
        title: 'Los 1 — Liegenschaften Nord (9 Objekte)',
        description: 'Unterhalts- und Glasreinigung, rund 61.000 m².',
        valueEur: 2_380_000,
        cpv: ['90911200'],
      },
      {
        title: 'Los 2 — Liegenschaften Süd (13 Objekte)',
        description: 'Unterhalts- und Glasreinigung, rund 87.000 m².',
        valueEur: 3_380_000,
        cpv: ['90911200'],
      },
    ],
    eligibility: [
      'Eintragung in das Handwerksregister für das Gebäudereiniger-Handwerk',
      'Zertifiziertes Qualitätsmanagement nach ISO 9001',
      'Tariftreueerklärung nach dem Rahmentarifvertrag Gebäudereinigung',
      'Mindestjahresumsatz von 4 Mio. EUR in den letzten drei Geschäftsjahren',
    ],
    staff: [
      'Objektleitung mit Meisterbrief im Gebäudereiniger-Handwerk',
      'Vorarbeitende je Liegenschaft benannt',
      'Nachweis der Unterweisung nach Gefahrstoffverordnung',
    ],
    documents: [
      { titel: 'Leistungsverzeichnis Reinigung', typ: 'pdf', groesse_kb: 1_890 },
      { titel: 'Raumbuch je Liegenschaft', typ: 'xlsx', groesse_kb: 640 },
      { titel: 'Vertragsbedingungen', typ: 'pdf', groesse_kb: 302 },
      { titel: 'Formblatt Referenzen', typ: 'docx', groesse_kb: 38 },
    ],
  },
  {
    publishedOffset: -11,
    deadlineOffset: 9,
    authorityIndex: 2,
    title: 'Technisches und infrastrukturelles Gebäudemanagement Verwaltungscampus',
    summary:
      'Integriertes Facility Management für einen Verwaltungscampus mit sieben Gebäuden.',
    description:
      'Ausgeschrieben wird das technische und infrastrukturelle Gebäudemanagement für einen Verwaltungscampus. Der Leistungsumfang umfasst Betrieb, Wartung und Instandhaltung der technischen Anlagen einschließlich Heizung, Lüftung, Klima und Elektrotechnik, die Durchführung der wiederkehrenden Prüfungen nach Betriebssicherheitsverordnung, den Störungsdienst mit 24/7-Rufbereitschaft sowie das Energiemanagement mit vierteljährlicher Verbrauchsberichterstattung. Ein CAFM-System für die Auftragsabwicklung ist vom Auftragnehmer zu stellen.',
    procurementCategory: 'dienstleistung',
    procedure: 'verhandlungsverfahren',
    cpv: ['79993000', '50700000'],
    sectors: ['facility_management'],
    city: 'Beispielhausen',
    postalCode: '80331',
    regionCode: 'BY',
    nuts: ['DE21'],
    valueEur: 7_450_000,
    durationMonths: 60,
    status: 'veroeffentlicht',
    lots: [],
    eligibility: [
      'Zertifiziertes Qualitätsmanagement nach ISO 9001',
      'Zertifiziertes Energiemanagement nach ISO 50001',
      'Zwei Referenzen über integriertes Facility Management mit mindestens 40.000 m² BGF',
      'Nachweis eines CAFM-Systems mit Schnittstelle zum Auftraggeber',
    ],
    staff: [
      'Objektleitung mit Abschluss als Technikerin bzw. Techniker oder Ingenieurwesen',
      'Elektrofachkraft nach DGUV Vorschrift 3 dauerhaft vor Ort',
      'Rufbereitschaft rund um die Uhr, Reaktionszeit maximal zwei Stunden',
    ],
    documents: [
      { titel: 'Leistungsbeschreibung FM', typ: 'pdf', groesse_kb: 2_410 },
      { titel: 'Anlagenverzeichnis', typ: 'xlsx', groesse_kb: 512 },
      { titel: 'Teilnahmeantrag', typ: 'docx', groesse_kb: 56 },
    ],
  },
  {
    publishedOffset: -21,
    deadlineOffset: -3,
    authorityIndex: 0,
    title: 'Sicherheitsdienstleistungen für städtische Schulen und Sporthallen',
    summary:
      'Schließdienst, Kontrollgänge und Alarmverfolgung für 34 Schulstandorte.',
    description:
      'Die Stadt Musterstadt schreibt Sicherheitsdienstleistungen für 34 Schulstandorte und angeschlossene Sporthallen aus. Der Leistungsumfang umfasst den abendlichen Schließdienst, Kontrollgänge nach festgelegtem Streifenplan, die Alarmverfolgung mit Interventionsdienst sowie die Objektbetreuung bei Schulveranstaltungen.',
    procurementCategory: 'dienstleistung',
    procedure: 'offenes_verfahren',
    cpv: ['79713000', '79715000'],
    sectors: ['security_services', 'property_protection'],
    city: 'Musterstadt',
    postalCode: '40210',
    regionCode: 'NW',
    nuts: ['DEA1'],
    valueEur: 920_000,
    durationMonths: 36,
    status: 'frist_abgelaufen',
    lots: [],
    eligibility: [
      'Bewachungserlaubnis nach § 34a GewO',
      'Erweitertes Führungszeugnis nach § 30a BZRG für das eingesetzte Personal',
    ],
    staff: [
      'Unterrichtungsnachweis nach § 34a GewO',
      'Erweitertes Führungszeugnis, nicht älter als drei Monate',
    ],
    documents: [{ titel: 'Leistungsverzeichnis Schulen', typ: 'pdf', groesse_kb: 720 }],
  },
  {
    publishedOffset: -46,
    deadlineOffset: -19,
    authorityIndex: 3,
    title: 'Wartung und Betrieb der Zutrittskontrollanlage Rechenzentrum',
    summary:
      'Wartung, Störungsbeseitigung und Betriebsunterstützung für eine Zutrittskontrollanlage mit 320 Lesepunkten.',
    description:
      'Gegenstand des Auftrags ist die Wartung und der technische Betrieb der Zutrittskontroll- und Videoanlage an zwei Rechenzentrumsstandorten. Der Leistungsumfang umfasst die jährliche Wartung nach Herstellervorgabe, die Störungsbeseitigung mit vierstündiger Reaktionszeit, das Berechtigungsmanagement sowie die Pflege des Zonenkonzepts.',
    procurementCategory: 'dienstleistung',
    procedure: 'nichtoffenes_verfahren',
    cpv: ['79711000', '72500000'],
    sectors: ['data_center', 'facility_management'],
    city: 'Datenstadt',
    postalCode: '60313',
    regionCode: 'HE',
    nuts: ['DE71'],
    valueEur: 1_180_000,
    durationMonths: 48,
    status: 'vergeben',
    lots: [],
    eligibility: [
      'Herstellerzertifizierung für die eingesetzte Zutrittskontrollplattform',
      'Zertifiziertes Informationssicherheitsmanagement nach ISO/IEC 27001',
    ],
    staff: [
      'Errichterqualifikation nach VdS 2311',
      'Erweiterte Sicherheitsüberprüfung (Ü2) für Personal mit Systemzugriff',
    ],
    documents: [{ titel: 'Wartungsleistungsverzeichnis', typ: 'pdf', groesse_kb: 430 }],
    award: {
      winner: 'Beispiel Sicherheitstechnik GmbH (DEMO)',
      winnerCity: 'Datenstadt',
      valueEur: 1_094_000,
      awardedOffset: -12,
      bidders: 4,
    },
  },
  {
    publishedOffset: -3,
    deadlineOffset: 45,
    authorityIndex: 1,
    title: 'Pforten- und Empfangsdienst Kreiskrankenhaus',
    summary: 'Ständig besetzter Pfortendienst mit Patientenlenkung, 24/7.',
    description:
      'Für das Kreiskrankenhaus ist ein durchgehend besetzter Pforten- und Empfangsdienst zu stellen. Zum Leistungsumfang gehören Patienten- und Besucherlenkung, Telefonzentrale, Annahme und Weiterleitung von Notrufen, Schrankenbedienung der Zufahrt sowie die Ausgabe von Schlüsseln und Transpondern. Nachts übernimmt der Dienst zusätzlich Kontrollgänge im Gebäude.',
    procurementCategory: 'dienstleistung',
    procedure: 'offenes_verfahren',
    cpv: ['98341120', '79992000'],
    sectors: ['reception_gate_services', 'security_services'],
    city: 'Beispielkreis',
    postalCode: '30159',
    regionCode: 'NI',
    nuts: ['DE92'],
    valueEur: 2_060_000,
    durationMonths: 48,
    status: 'veroeffentlicht',
    lots: [],
    eligibility: [
      'Bewachungserlaubnis nach § 34a GewO',
      'Referenz über einen Pfortendienst im Krankenhausbetrieb',
      'Nachweis eines Vertretungskonzepts bei Personalausfall',
    ],
    staff: [
      'Unterrichtungsnachweis nach § 34a GewO',
      'Schulung im Umgang mit Notfallsituationen im Klinikbetrieb',
      'Deutschkenntnisse mindestens Niveau B2',
    ],
    documents: [
      { titel: 'Leistungsbeschreibung Pfortendienst', typ: 'pdf', groesse_kb: 486 },
      { titel: 'Dienstplanmodell', typ: 'xlsx', groesse_kb: 74 },
    ],
  },
  {
    publishedOffset: -7,
    deadlineOffset: 21,
    authorityIndex: 4,
    title: 'Mobile Sicherheitsstreife für Grünanlagen und Parkflächen',
    summary: 'Bestreifung öffentlicher Grün- und Parkflächen in den Abendstunden.',
    description:
      'Ausgeschrieben wird ein mobiler Streifendienst für sieben öffentliche Grünanlagen und drei Parkhäuser. Die Bestreifung erfolgt täglich zwischen 18:00 und 02:00 Uhr mit zwei Streifenfahrzeugen. Aufgabe ist die Präsenzstreife, das Ansprechen von Ordnungsverstößen, die Dokumentation von Sachbeschädigungen sowie die Verständigung von Polizei und Rettungsdiensten.',
    procurementCategory: 'dienstleistung',
    procedure: 'offenes_verfahren',
    cpv: ['79715000', '79713000'],
    sectors: ['security_services', 'property_protection'],
    city: 'Musterhafen',
    postalCode: '20095',
    regionCode: 'HH',
    nuts: ['DE60'],
    valueEur: 640_000,
    durationMonths: 24,
    status: 'veroeffentlicht',
    lots: [],
    eligibility: [
      'Bewachungserlaubnis nach § 34a GewO',
      'Stellung von mindestens zwei einsatzbereiten Streifenfahrzeugen',
    ],
    staff: [
      'Sachkundeprüfung nach § 34a GewO',
      'Führerschein Klasse B',
      'Deeskalationsschulung',
    ],
    documents: [
      { titel: 'Leistungsverzeichnis Streifendienst', typ: 'pdf', groesse_kb: 264 },
      { titel: 'Übersicht Streifengebiete', typ: 'pdf', groesse_kb: 1_020 },
    ],
  },
  {
    publishedOffset: -30,
    deadlineOffset: -8,
    authorityIndex: 5,
    title: 'Sonderreinigung und Desinfektion in Klinikbereichen',
    summary: 'Unterhalts- und Desinfektionsreinigung für OP- und Intensivbereiche.',
    description:
      'Der Klinikverbund schreibt die Unterhalts- und Desinfektionsreinigung für OP-Bereiche, Intensivstationen und Isolierzimmer aus. Die Reinigung erfolgt nach dem Hygieneplan des Auftraggebers unter Beachtung der KRINKO-Empfehlungen. Der Auftragnehmer stellt geschultes Personal, dokumentiert jede Reinigungsleistung und nimmt an den Begehungen der Krankenhaushygiene teil.',
    procurementCategory: 'dienstleistung',
    procedure: 'offenes_verfahren',
    cpv: ['90910000', '90911200'],
    sectors: ['cleaning'],
    city: 'Beispielstadt',
    postalCode: '01067',
    regionCode: 'SN',
    nuts: ['DED2'],
    valueEur: 2_890_000,
    durationMonths: 36,
    status: 'vergeben',
    lots: [],
    eligibility: [
      'Zertifiziertes Qualitätsmanagement nach ISO 9001',
      'Referenz über Reinigung in Bereichen mit erhöhten Hygieneanforderungen',
      'Hygieneschulungskonzept nach KRINKO',
    ],
    staff: [
      'Jährliche Hygieneschulung, dokumentiert',
      'Nachweis der arbeitsmedizinischen Vorsorge nach ArbMedVV',
    ],
    documents: [{ titel: 'Hygieneplan (Auszug)', typ: 'pdf', groesse_kb: 880 }],
    award: {
      winner: 'Musterreinigung Beispielstadt GmbH & Co. KG (DEMO)',
      winnerCity: 'Beispielstadt',
      valueEur: 2_734_500,
      awardedOffset: -5,
      bidders: 6,
    },
  },
];

/** German date formatting, matching what a portal export would deliver. */
function formatGermanDate(date: Date): string {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${day}.${month}.${date.getFullYear()}`;
}

function formatGermanDateTime(date: Date, time: string): string {
  return `${formatGermanDate(date)} ${time}`;
}

function formatGermanMoney(value: number): string {
  return `${new Intl.NumberFormat('de-DE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)} EUR`;
}

function shiftDays(base: Date, days: number): Date {
  const result = new Date(base);
  result.setDate(result.getDate() + days);
  return result;
}

/**
 * Builds the demo payloads.
 *
 * Dates are relative to `now` so the deadline screens stay meaningful over
 * time; everything else is deterministic, which keeps payload hashes stable
 * within a day and lets the runner skip unchanged records.
 */
export function buildDemoPayloads(now: Date = new Date()): DemoTenderPayload[] {
  return TENDER_SPECS.map((spec, index) => {
    const authority = AUTHORITIES[spec.authorityIndex % AUTHORITIES.length];
    if (!authority) {
      throw new Error('Demo fixture references an unknown authority');
    }

    const publishedAt = shiftDays(now, spec.publishedOffset);
    const deadlineAt = shiftDays(now, spec.deadlineOffset);
    const questionsUntil = shiftDays(deadlineAt, -10);
    const bindingUntil = shiftDays(deadlineAt, 45);
    const contractStart = shiftDays(deadlineAt, 60);
    const contractEnd = shiftDays(contractStart, spec.durationMonths * 30);
    const sequence = String(index + 1).padStart(4, '0');

    const award =
      spec.award === undefined
        ? undefined
        : {
            zuschlag_id: `DEMO-ZS-${publishedAt.getFullYear()}-${sequence}`,
            auftragnehmer: spec.award.winner,
            auftragnehmer_ort: spec.award.winnerCity,
            zuschlagswert: formatGermanMoney(spec.award.valueEur),
            zuschlag_am: formatGermanDate(shiftDays(now, spec.award.awardedOffset)),
            anzahl_bieter: spec.award.bidders,
          };

    return {
      demo: true,
      vergabe_id: `DEMO-${publishedAt.getFullYear()}-${sequence}`,
      bezeichnung: spec.title,
      kurzbeschreibung: spec.summary,
      leistungsbeschreibung: spec.description,
      aktenzeichen: `DEMO/VgV/${publishedAt.getFullYear()}/${sequence}`,
      vergabeart: spec.procedure,
      leistungsart: spec.procurementCategory,
      cpv: spec.cpv,
      branchen: spec.sectors,
      auftraggeber: {
        id: authority.id,
        name: authority.name,
        typ: authority.typ,
        strasse: authority.strasse,
        plz: authority.plz,
        ort: authority.ort,
        bundesland: authority.bundesland,
        land: 'DE',
        email: `vergabe@${authority.id.toLowerCase()}.demo.invalid`,
        telefon: '+49 000 0000000',
      },
      erfuellungsort: {
        ort: spec.city,
        plz: spec.postalCode,
        bundesland: spec.regionCode,
        land: 'DE',
        nuts: spec.nuts,
      },
      veroeffentlicht_am: formatGermanDate(publishedAt),
      angebotsfrist: formatGermanDateTime(deadlineAt, '12:00'),
      bieterfragen_bis: formatGermanDate(questionsUntil),
      bindefrist: formatGermanDate(bindingUntil),
      vertragsbeginn: formatGermanDate(contractStart),
      vertragsende: formatGermanDate(contractEnd),
      laufzeit_monate: spec.durationMonths,
      geschaetzter_auftragswert: formatGermanMoney(spec.valueEur),
      status: spec.status,
      lose: spec.lots.map((lot, lotIndex) => ({
        los_nr: String(lotIndex + 1),
        titel: lot.title,
        beschreibung: lot.description,
        wert: formatGermanMoney(lot.valueEur),
        cpv: lot.cpv,
      })),
      eignungskriterien: spec.eligibility,
      personalanforderungen: spec.staff,
      unterlagen: spec.documents,
      quelle_url: `https://demo.sichervergabe.invalid/bekanntmachung/DEMO-${publishedAt.getFullYear()}-${sequence}`,
      ...(award === undefined ? {} : { zuschlag: award }),
    };
  });
}
