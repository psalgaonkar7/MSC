// Test data for the MSC. `q` = what to type into the autocomplete; `opt` = the exact
// suggestion text to click. Adjust `opt` strings if the portal's wording changes.
//
// COVERAGE MODEL — read this before adding a journey.
// The goal is that every carrier on the B2B connectivity (health-center) page is genuinely
// exercised. Three fields make that provable rather than assumed:
//
//   connectivityNames  the EXACT health-center names this journey proves. Nothing is inferred
//                      from the `carrier` label any more — fuzzy matching used to make
//                      "EUROPEAN SLEEPER" match nothing and "DBSNCF" match both DB and SNCF.
//   carrierSlug        prefix of the results-page `data-select="ptp-carrier-logo-<slug>"`.
//                      Used to add THAT carrier's fare instead of whatever is listed first —
//                      without it, Barcelona->Madrid only ever tested one of RENFE/IRYO/OUIGO.
//                      Matched as a PREFIX so sub-brands are picked up automatically
//                      (rdg_avanti_west_coast / rdg_lumo / rdg_scotrail all satisfy `rdg`).
//   fromCode/toCode    LocoHub station codes, so api-searchability.js can derive its route
//                      list from here instead of keeping a second hand-maintained copy.
//
// Slugs below were observed live via `node tools/discover-carriers.js` — not guessed.
// Several carriers are brand-labelled rather than operator-labelled (SNCF sells as
// `tgvinoui`, DB as `dbahn`, TRENITALIA as `trenitalia_frecciarossa`); prefix matching is
// what makes those provable.

module.exports = {
  // ~45 days out keeps us well inside every carrier's booking horizon and your ">=7 days" rule.
  // Overridable with env var MSC_DAYS_AHEAD.
  daysAhead: Number(process.env.MSC_DAYS_AHEAD || 45),

  pos: {
    default: 'ERA-INTERNAL-TEST',     // account 556680 (the default Test Profile)
    sncfConnect: '832072551',          // KA-RESAS-EUROPE-FRANCE (SNCF Connect agency)
  },

  ptpJourneys: [
    { id: 1,  carrier: 'OBB',              connectivityNames: ['OBB'],              carrierSlug: 'obb',
      fromCode: 'AT:vienna', toCode: 'DE:munich',
      from: { q: 'Vienna',    opt: 'Vienna, Austria' },                       to: { q: 'Munich',    opt: 'Munich Hbf, Germany' } },
    { id: 2,  carrier: 'DB',               connectivityNames: ['DB'],               carrierSlug: 'dbahn',
      fromCode: 'DE:berlin', toCode: 'DE:munich',
      from: { q: 'Berlin',    opt: 'Berlin, Germany' },                       to: { q: 'Munich',    opt: 'Munich Hbf, Germany' } },
    // Paris->Stuttgart is the Alleo (DB/SNCF joint venture) route. Discovery showed slugs
    // dbahn, dbahn_intercity_express, dbsncf and tgvinoui here — but NOT `ter`, so TER needs
    // its own sector (id 18) rather than riding along on this one as the old label implied.
    { id: 3,  carrier: 'DBSNCF (Alleo)',   connectivityNames: ['DBSNCF'],           carrierSlug: 'dbsncf',
      fromCode: 'FR:paris', toCode: 'DE:stuttgart',
      from: { q: 'Paris',     opt: 'Paris (All stations), France' },          to: { q: 'Stuttgart', opt: 'Stuttgart, Germany' } },
    { id: 4,  carrier: 'EUROSTAR',         connectivityNames: ['EUROSTAR'],         carrierSlug: 'eurostar',
      fromCode: 'GB:london', toCode: 'FR:paris',
      from: { q: 'London',    opt: 'London St. Pancras International, UK' },  to: { q: 'Paris',     opt: 'Paris (All stations), France' } },
    { id: 5,  carrier: 'LYRIA',            connectivityNames: ['LYRIA'],            carrierSlug: 'lyria',
      fromCode: 'CH:geneva', toCode: 'FR:paris',
      from: { q: 'Geneva',    opt: 'Geneva, Switzerland' },                   to: { q: 'Paris',     opt: 'Paris (All stations), France' } },
    { id: 6,  carrier: 'RDG',              connectivityNames: ['RDG'],              carrierSlug: 'rdg',
      fromCode: 'GB:edinburgh', toCode: 'GB:london',
      from: { q: 'Edinburgh', opt: 'Edinburgh (Waverley, city centre), UK' }, to: { q: 'London',    opt: 'London (All stations), UK' } },
    { id: 7,  carrier: 'SNCB',             connectivityNames: ['SNCB'],             carrierSlug: 'sncb',
      fromCode: 'BE:brussels_midi', toCode: 'BE:mons',
      from: { q: 'Bruxelles', opt: 'Bruxelles/Brussels-Midi, Belgium' },      to: { q: 'Mons',      opt: 'Mons, Belgium' } },
    // Barcelona->Madrid genuinely returns THREE carriers. One entry each so all three are
    // actually added to the cart; previously the first-listed fare won and two went untested.
    { id: 8,  carrier: 'RENFE',            connectivityNames: ['RENFE'],            carrierSlug: 'renfe',
      fromCode: 'ES:barcelona_sants', toCode: 'ES:madrid_atocha',
      from: { q: 'Barcelona', opt: 'Barcelona Sants, Spain' },                to: { q: 'Madrid',    opt: 'Madrid-Puerta De Atocha, Spain' } },
    { id: 9,  carrier: 'IRYO',             connectivityNames: ['IRYO'],             carrierSlug: 'iryo',
      fromCode: 'ES:barcelona_sants', toCode: 'ES:madrid_atocha',
      from: { q: 'Barcelona', opt: 'Barcelona Sants, Spain' },                to: { q: 'Madrid',    opt: 'Madrid-Puerta De Atocha, Spain' } },
    { id: 10, carrier: 'OUIGO',            connectivityNames: ['OUIGO'],            carrierSlug: 'ouigo',
      fromCode: 'ES:barcelona_sants', toCode: 'ES:madrid_atocha',
      from: { q: 'Barcelona', opt: 'Barcelona Sants, Spain' },                to: { q: 'Madrid',    opt: 'Madrid-Puerta De Atocha, Spain' } },
    // RHB + SBB share this route. Both were unconfirmed at discovery time (SBB was flagged
    // unstable and RHB unknown), so the slug is a best guess pending a re-probe when they recover.
    { id: 11, carrier: 'RHB/SBB',          connectivityNames: ['RHB', 'SBB'],       carrierSlug: null,
      fromCode: 'CH:zermatt', toCode: 'CH:chur',
      from: { q: 'Zermatt',   opt: 'Zermatt, Switzerland' },                  to: { q: 'Chur',      opt: 'Chur, Switzerland' } },
    // REJE and RJET are two RegioJet connectors that the results page renders with the SAME
    // `regiojet` logo — but the LocoHub API distinguishes them by route (Prague->Brno returns
    // REJE, Wien->Gyor returns RJET), so keeping both ODs is what actually covers both.
    { id: 12, carrier: 'RegioJet (REJE)',  connectivityNames: ['REJE'],             carrierSlug: 'regiojet',
      fromCode: 'CZ:prague', toCode: 'CZ:brno',
      from: { q: 'Prague',    opt: 'Praha hl.n, Czechia' },                   to: { q: 'Brno',      opt: 'Brno hl.n., Czechia' } },
    { id: 13, carrier: 'RegioJet (RJET)',  connectivityNames: ['RJET'],             carrierSlug: 'regiojet',
      fromCode: 'AT:wien_hbf', toCode: 'HU:gyor',
      from: { q: 'Wien',      opt: 'Wien Hbf, Austria' },                     to: { q: 'Gyor',      opt: 'Gyor, Hungary' } },
    { id: 14, carrier: 'TRENITALIA',       connectivityNames: ['TRENITALIA'],       carrierSlug: 'trenitalia',
      fromCode: 'IT:rome', toCode: 'IT:milan',
      from: { q: 'Rome',      opt: 'Rome, Italy' },                           to: { q: 'Milan',     opt: 'Milano Centrale, Italy' } },
    { id: 15, carrier: 'ITALO',            connectivityNames: ['ITALO'],            carrierSlug: 'italo',
      fromCode: 'IT:rome', toCode: 'IT:milan',
      from: { q: 'Rome',      opt: 'Rome, Italy' },                           to: { q: 'Milan',     opt: 'Milano Centrale, Italy' } },

    // ---- added to close connectivity-page coverage gaps (slugs confirmed by discovery) ----
    { id: 16, carrier: 'EUROPEAN SLEEPER', connectivityNames: ['EUROPEAN SLEEPER'], carrierSlug: 'european_sleeper',
      fromCode: 'BE:brussels_midi', toCode: 'NL:amsterdam',
      from: { q: 'Bruxelles', opt: 'Bruxelles/Brussels-Midi, Belgium' },      to: { q: 'Amsterdam', opt: 'Amsterdam, Netherlands' } },
    { id: 17, carrier: 'LEO EXPRESS',      connectivityNames: ['LEO EXPRESS'],      carrierSlug: 'leo_express',
      fromCode: 'CZ:prague', toCode: 'CZ:ostrava',
      from: { q: 'Prague',    opt: 'Praha hl.n, Czechia' },                   to: { q: 'Ostrava',   opt: 'Ostrava, Czechia' } },
    { id: 18, carrier: 'TER',              connectivityNames: ['TER'],              carrierSlug: 'ter',
      fromCode: 'FR:paris', toCode: 'FR:rouen',
      from: { q: 'Paris',     opt: 'Paris (All stations), France' },          to: { q: 'Rouen',     opt: 'Rouen-Rive-Droite, France' } },
    // SNCF has no `sncf` logo — it sells as TGV INOUI, so that brand slug is the proof.
    { id: 19, carrier: 'SNCF (TGV INOUI)', connectivityNames: ['SNCF'],             carrierSlug: 'tgvinoui',
      fromCode: 'FR:paris', toCode: 'FR:bordeaux',
      from: { q: 'Paris',     opt: 'Paris (All stations), France' },          to: { q: 'Bordeaux',  opt: 'Bordeaux, France' } },
  ],

  // Carriers on the connectivity page that are deliberately NOT booked, with the reason.
  // Listed explicitly so the coverage check can tell "knowingly excluded" from "we forgot".
  connectivityOnly: [
    { carrier: 'HEPSTAR', reason: 'insurance service, not a bookable rail product' },
  ],

  // Carriers still awaiting a confirmed origin-destination. They were down, unknown, or simply
  // did not appear on the route tried during discovery, so no OD is asserted rather than
  // guessing one. Re-run `node tools/discover-carriers.js` once they are up.
  pendingDiscovery: [
    { carrier: 'ARENAWAYS',        note: 'not returned on Torino->Milan; needs another OD' },
    { carrier: 'CAMPANIA EXPRESS', note: 'flagged DOWN at discovery; Napoli->Sorrento search would not submit' },
    { carrier: 'SJ',               note: 'flagged UNKNOWN at discovery; Stockholm->Goteborg station text needs fixing' },
  ],

  // Rail passes to validate (search-only). The PASSES tab is destination-based:
  //  - "Europe" returns both Eurail AND Interrail Global Passes (brand shown depends on market/POS).
  //  - "Switzerland" returns the Swiss Travel Pass family.
  //  - "United Kingdom" returns the BritRail family (the dropdown has no "Great Britain" entry —
  //    that guess is what made the first BritRail attempt time out).
  passChecks: [
    { destination: 'Europe',        label: 'Eurail + Interrail Global Pass', mustInclude: [/eurail global/i, /interrail global/i] },
    { destination: 'Switzerland',   label: 'Swiss Travel Pass',              mustInclude: [/swiss travel pass/i] },
    { destination: 'United Kingdom', label: 'BritRail Pass',                  mustInclude: [/britrail/i] },
  ],

  // Rail passes added to the SAME B2B cart alongside every sector (used by the booking test,
  // not the search-only passChecks above). productMatch picks the specific product out of a
  // destination's multiple results (Continuous/Flex variants) — first match wins.
  // `connectivityNames` ties each pass back to the Passes inventories section of the
  // health-center page, whose SBB/TRENITALIA entries are separate from the point-to-point ones.
  passesToAdd: [
    { destination: 'Europe',        productMatch: /eurail global/i,     label: 'Eurail Global Pass',    connectivityNames: ['EURAIL'] },
    { destination: 'Europe',        productMatch: /interrail global/i,  label: 'Interrail Global Pass', connectivityNames: [] },
    { destination: 'Switzerland',   productMatch: /swiss travel pass/i, label: 'Swiss Travel Pass',     connectivityNames: ['SBB'] },
    { destination: 'United Kingdom', productMatch: /britrail/i,          label: 'BritRail Pass',         connectivityNames: ['BRITRAIL'] },
  ],

  // SNCF Connect POS test: search-only validation (no booking) for these 3 ODs.
  // `connectivityNames` is carried here too so a POS failure caused by a carrier that is
  // ALREADY flagged down (Zermatt->Chur whenever SBB is out) is reported as an expected
  // outage rather than failing the POS check and reading as an SNCF-Connect regression.
  sncfPosJourneys: [
    { connectivityNames: ['DB'],          from: { q: 'Berlin',  opt: 'Berlin, Germany' },              to: { q: 'Munich',    opt: 'Munich Hbf, Germany' } },
    { connectivityNames: ['RHB', 'SBB'],  from: { q: 'Zermatt', opt: 'Zermatt, Switzerland' },         to: { q: 'Chur',      opt: 'Chur, Switzerland' } },
    { connectivityNames: ['DBSNCF'],      from: { q: 'Paris',   opt: 'Paris (All stations), France' }, to: { q: 'Stuttgart', opt: 'Stuttgart, Germany' } },
  ],
};
