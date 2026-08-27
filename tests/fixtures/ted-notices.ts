/**
 * TED search responses captured verbatim from api.ted.europa.eu.
 *
 * Two real notices, trimmed to German and English translations so the file
 * stays readable — no value is edited. They are public EU procurement
 * notices, not customer data, so they may live in the repository.
 *
 *  - `TED_COMPETITION_NOTICE`: a contract notice (`cn-standard`) for guard
 *    services, restricted procedure, single lot.
 *  - `TED_RESULT_NOTICE`: an award notice (`can-standard`) with three lots,
 *    two distinct winners and three tender values — the case where TED's
 *    parallel arrays cannot be correlated, and the mapper must leave fields
 *    empty rather than guess.
 */

export const TED_COMPETITION_NOTICE: Record<string, unknown> = {
  "contract-duration-start-date-lot": [
    "2027-07-31+02:00"
  ],
  "notice-type": "cn-standard",
  "publication-number": "479730-2026",
  "submission-url-lot": [
    "https://www.evergabe-online.de/tenderdetails.html?id=874855"
  ],
  "place-of-performance-city-lot": [
    "Schwielowsee"
  ],
  "place-of-performance-post-code-lot": [
    "14548"
  ],
  "official-language": [
    "DEU"
  ],
  "publication-date": "2026-07-13+02:00",
  "links": {
    "xml": {
      "MUL": "https://ted.europa.eu/en/notice/479730-2026/xml"
    },
    "pdf": {
      "DEU": "https://ted.europa.eu/de/notice/479730-2026/pdf",
      "ENG": "https://ted.europa.eu/en/notice/479730-2026/pdf"
    },
    "pdfs": {
      "DEU": "https://ted.europa.eu/de/notice/479730-2026/pdfs"
    },
    "html": {
      "DEU": "https://ted.europa.eu/de/notice/-/detail/479730-2026",
      "ENG": "https://ted.europa.eu/en/notice/-/detail/479730-2026"
    },
    "htmlDirect": {
      "DEU": "https://ted.europa.eu/de/notice/479730-2026/html",
      "ENG": "https://ted.europa.eu/en/notice/479730-2026/html"
    }
  },
  "buyer-post-code": [
    "13405"
  ],
  "identifier-lot": [
    "LOT-0000"
  ],
  "contract-duration-end-date-lot": [
    "2031-07-31+02:00"
  ],
  "buyer-city": {},
  "buyer-email": [
    "BwDLZBerlinBeschaffung@Bundeswehr.org"
  ],
  "deadline-receipt-request-date-lot": [
    "2026-08-10+02:00"
  ],
  "notice-identifier": "f97b0751-7d7b-485d-98a9-fc089091040f",
  "place-of-performance": [
    "DE40E",
    "DEU",
    "DE40E",
    "DEU"
  ],
  "title-proc": {
    "deu": "Bewachung Henning-von-Tresckow-Kaserne"
  },
  "buyer-legal-type": [
    "cga"
  ],
  "buyer-country": [
    "DEU"
  ],
  "place-of-performance-country-lot": [
    "DEU"
  ],
  "description-lot": {
    "deu": [
      "Bewachung und Absicherung von Anlagen und Einrichtungen der Bundeswehr, hier in der Liegenschaft Henning-von-Tresckow-Kaserne in Schwielowsee mit persönlich zugewiesener Waffe P8 oder dem bei der Bundeswehr eingeführten Nachfolgemodell. Laufzeit des Vertrages: 31.07.2027 06:00 Uhr bis 31.07.2031 06:00 Uhr mit der Option, die Vertragslaufzeit einmalig um bis zu 3 Jahre zu verlängern (Maximale Gesamtvertragslaufzeit insgesamt 7 Jahre). Anforderungen für die Henning-von-Tresckow-Kaserne in Schwielowsee: Die zu bewachende Liegenschaft ist in der Wachkategorie A 2 eingestuft - personelle Wachleistung mit dem Einsatz von einem Dienstfahrzeug und ohne den Einsatz von Wachbegleithunden (Diensthunde). Eine gesonderte Sicherheitsüberprüfung nach dem Sicherheitsüberprüfungsgesetz (SÜG) SÜ-2 Sabotageschutz (Ü-2 SabSchutz) ist erforderlich. Die Wachaufgabe ist zu erfüllen mit über 10 Sicherheitsmitarbeitern im 2x12 Std Schichtdienst, 24 Std pro Tag /7 Tage pro Woche. Der Bieter hat die Möglichkeit, in der Liegenschaft einen Besichtigungstermin vor Ort wahrzunehmen (Geplant in der 38.-39. KW). Bei der Ortsbesichtigung sind pro Unternehmen maximal 3 Personen zugelassen. Fragen zur Angebotserstellung, auch im Rahmen der Ortsbesichtigung, sind schriftlich an die Vergabestelle zu richten. Die Vergabestelle beantwortet alle Fragen schriftlich gegenüber allen Bietern. Sollten Sie während der Ortsbesichtigung kalkulationsrelevante Informationen erhalten, so sind Sie verpflichtet, sich die Relevanz dieser Informationen durch die Vergabestelle bestätigen zu lassen."
    ]
  },
  "procedure-type": "restricted",
  "classification-cpv": [
    "79713000",
    "79713000"
  ],
  "contract-nature": [
    "services",
    "services"
  ],
  "buyer-name": {
    "deu": [
      "Bundeswehr-Dienstleistungszentrum Berlin"
    ]
  },
  "buyer-internet-address": [
    "http://www.evergabe-online.de/"
  ],
  "notice-title": {
    "deu": "Deutschland – Bewachungsdienste – Bewachung Henning-von-Tresckow-Kaserne",
    "eng": "Germany – Guard services – Bewachung Henning-von-Tresckow-Kaserne"
  },
  "title-lot": {
    "deu": [
      "Bewachung Henning-von-Tresckow-Kaserne"
    ]
  },
  "form-type": "competition",
  "description-proc": {
    "deu": "Bewachung Henning-von-Tresckow-Kaserne"
  }
};

export const TED_RESULT_NOTICE: Record<string, unknown> = {
  "notice-type": "can-standard",
  "publication-number": "291981-2026",
  "winner-country": [
    "DEU",
    "DEU"
  ],
  "place-of-performance-city-lot": [
    "Worms",
    "Worms",
    "Worms"
  ],
  "winner-identifier": [
    "DE117335997",
    "DE 423 962 710"
  ],
  "place-of-performance-post-code-lot": [
    "67547",
    "67547",
    "67547"
  ],
  "official-language": [
    "DEU"
  ],
  "publication-date": "2026-04-29+02:00",
  "received-submissions-type-code": [
    "tenders",
    "t-esubm",
    "t-sme",
    "tenders",
    "t-esubm",
    "t-sme",
    "tenders",
    "t-esubm",
    "t-sme"
  ],
  "links": {
    "xml": {
      "MUL": "https://ted.europa.eu/en/notice/291981-2026/xml"
    },
    "pdf": {
      "DEU": "https://ted.europa.eu/de/notice/291981-2026/pdf",
      "ENG": "https://ted.europa.eu/en/notice/291981-2026/pdf"
    },
    "pdfs": {
      "DEU": "https://ted.europa.eu/de/notice/291981-2026/pdfs"
    },
    "html": {
      "DEU": "https://ted.europa.eu/de/notice/-/detail/291981-2026",
      "ENG": "https://ted.europa.eu/en/notice/-/detail/291981-2026"
    },
    "htmlDirect": {
      "DEU": "https://ted.europa.eu/de/notice/291981-2026/html",
      "ENG": "https://ted.europa.eu/en/notice/291981-2026/html"
    }
  },
  "buyer-post-code": [
    "67547"
  ],
  "identifier-lot": [
    "LOT-0001",
    "LOT-0002",
    "LOT-0003"
  ],
  "buyer-city": {},
  "buyer-email": [
    "ausschreibungen@worms.de"
  ],
  "notice-identifier": "af71f166-d087-4d7d-9f51-5e55337411c4",
  "place-of-performance": [
    "DEB39",
    "DEU",
    "DEB39",
    "DEB39",
    "DEB39",
    "DEU",
    "DEU",
    "DEU"
  ],
  "title-proc": {
    "deu": "UNESCO Welterbstätten Worms - Alter jüdischer Friedhof, Synagoge und Synagogenbezirk - Stellung Sicherheitspersonal und Reinigung"
  },
  "winner-city": [
    "Lingen",
    "Ludwigshafen am Rhein"
  ],
  "buyer-legal-type": [
    "la"
  ],
  "buyer-country": [
    "DEU"
  ],
  "received-submissions-type-val": [
    "9",
    "9",
    "8",
    "9",
    "9",
    "8",
    "7",
    "7",
    "7"
  ],
  "tender-value-cur": [
    "EUR"
  ],
  "tender-value": [
    "320649.86",
    "210787.86",
    "5850.00"
  ],
  "place-of-performance-country-lot": [
    "DEU",
    "DEU",
    "DEU"
  ],
  "description-lot": {
    "deu": [
      "Stellung von Sicherheitspersonal in der Synagoge und im Synagogenbezirk Worms",
      "Stellung von Sicherheitspersonal als Aufsicht auf dem Alten jüdischen Friedhof \"Heiliger Sand\" in Worms",
      "Reinigung der zur Verfügung gestellten WC-Anlage und des Pausenraumes im Wärterhaus des Alten jüdischen Friedhofs Worms"
    ]
  },
  "procedure-type": "open",
  "classification-cpv": [
    "79713000",
    "79713000",
    "79713000",
    "90910000"
  ],
  "contract-nature": [
    "services",
    "services",
    "services",
    "services"
  ],
  "buyer-name": {
    "deu": [
      "Stadtverwaltung Worms, Abt. 6.4 Zentrale Ausschreibungsstelle und Dienste"
    ]
  },
  "buyer-internet-address": [
    "https://www.worms.de"
  ],
  "winner-name": {
    "deu": [
      "Wach- und Werkschutz Kurt Strube GmbH",
      "Wach- und Werkschutz Kurt Strube GmbH",
      "AWD-Gebäudedienste"
    ]
  },
  "notice-title": {
    "deu": "Deutschland – Bewachungsdienste – UNESCO Welterbstätten Worms - Alter jüdischer Friedhof, Synagoge und Synagogenbezirk - Stellung Sicherheitspersonal und Reinigung",
    "eng": "Germany – Guard services – UNESCO Welterbstätten Worms - Alter jüdischer Friedhof, Synagoge und Synagogenbezirk - Stellung Sicherheitspersonal und Reinigung"
  },
  "title-lot": {
    "deu": [
      "Synagoge Sicherheitspers.",
      "Friedhof Sicherheitspers.",
      "Reinigung Friedhof"
    ]
  },
  "form-type": "result",
  "description-proc": {
    "deu": "UNESCO Welterbstätten Worms - Alter jüdischer Friedhof, Synagoge und Synagogenbezirk - Stellung Sicherheitspersonal und Reinigung"
  }
};
