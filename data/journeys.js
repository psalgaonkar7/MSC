// Test data for the MSC. `q` = what to type into the autocomplete; `opt` = the exact
// suggestion text to click. Adjust `opt` strings if the portal's wording changes.

module.exports = {
  // ~45 days out keeps us well inside every carrier's booking horizon and your ">=7 days" rule.
  // Overridable with env var MSC_DAYS_AHEAD.
  daysAhead: Number(process.env.MSC_DAYS_AHEAD || 45),

  pos: {
    default: 'ERA-INTERNAL-TEST',     // account 556680 (the default Test Profile)
    sncfConnect: '832072551',          // KA-RESAS-EUROPE-FRANCE (SNCF Connect agency)
  },

  // The 12 point-to-point journeys (Geneva->Paris is one journey that the portal splits into 2 legs).
  ptpJourneys: [
    { id: 1,  carrier: 'OBB',                from: { q: 'Vienna',    opt: 'Vienna, Austria' },                        to: { q: 'Munich',    opt: 'Munich Hbf, Germany' } },
    { id: 2,  carrier: 'DB',                 from: { q: 'Berlin',    opt: 'Berlin, Germany' },                        to: { q: 'Munich',    opt: 'Munich Hbf, Germany' } },
    { id: 3,  carrier: 'TER/SNCF',           from: { q: 'Paris',     opt: 'Paris (All stations), France' },           to: { q: 'Stuttgart', opt: 'Stuttgart, Germany' } },
    { id: 4,  carrier: 'EUROSTAR',           from: { q: 'London',    opt: 'London St. Pancras International, UK' },    to: { q: 'Paris',     opt: 'Paris (All stations), France' } },
    { id: 5,  carrier: 'LYRIA',              from: { q: 'Geneva',    opt: 'Geneva, Switzerland' },                    to: { q: 'Paris',     opt: 'Paris (All stations), France' } },
    { id: 6,  carrier: 'RDG (Avanti)',       from: { q: 'Edinburgh', opt: 'Edinburgh (Waverley, city centre), UK' },  to: { q: 'London',    opt: 'London (All stations), UK' } },
    { id: 7,  carrier: 'SNCB',               from: { q: 'Bruxelles', opt: 'Bruxelles/Brussels-Midi, Belgium' },       to: { q: 'Mons',      opt: 'Mons, Belgium' } },
    { id: 8,  carrier: 'RENFE/IRYO',         from: { q: 'Barcelona', opt: 'Barcelona Sants, Spain' },                 to: { q: 'Madrid',    opt: 'Madrid-Puerta De Atocha, Spain' } },
    { id: 9,  carrier: 'RHB/SBB',            from: { q: 'Zermatt',   opt: 'Zermatt, Switzerland' },                   to: { q: 'Chur',      opt: 'Chur, Switzerland' } },
    { id: 10, carrier: 'RegioJet',           from: { q: 'Prague',    opt: 'Praha hl.n, Czechia' },                    to: { q: 'Brno',      opt: 'Brno hl.n., Czechia' } },
    { id: 11, carrier: 'RegioJet',           from: { q: 'Wien',      opt: 'Wien Hbf, Austria' },                      to: { q: 'Gyor',      opt: 'Gyor, Hungary' } },
    { id: 12, carrier: 'TRENITALIA/ITALO',   from: { q: 'Rome',      opt: 'Rome, Italy' },                            to: { q: 'Milan',     opt: 'Milano Centrale, Italy' } },
  ],

  // Rail passes to validate (search-only). The PASSES tab is destination-based:
  //  - "Europe" returns both Eurail AND Interrail Global Passes (brand shown depends on market/POS).
  //  - "Switzerland" returns the Swiss Travel Pass family.
  passChecks: [
    { destination: 'Europe',      label: 'Eurail + Interrail Global Pass', mustInclude: [/eurail global/i, /interrail global/i] },
    { destination: 'Switzerland', label: 'Swiss Travel Pass',              mustInclude: [/swiss travel pass/i] },
  ],

  // SNCF Connect POS test: search-only validation (no booking) for these 3 ODs.
  sncfPosJourneys: [
    { from: { q: 'Berlin',  opt: 'Berlin, Germany' },              to: { q: 'Munich',    opt: 'Munich Hbf, Germany' } },
    { from: { q: 'Zermatt', opt: 'Zermatt, Switzerland' },         to: { q: 'Chur',      opt: 'Chur, Switzerland' } },
    { from: { q: 'Paris',   opt: 'Paris (All stations), France' }, to: { q: 'Stuttgart', opt: 'Stuttgart, Germany' } },
  ],
};
