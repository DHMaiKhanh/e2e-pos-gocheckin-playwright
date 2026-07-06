/**
 * Customers of the "Nail Salon Demo" tenant (store 100004), scanned live from
 * the Go Booking "New Appointment" customer list via Playwright MCP.
 *
 * Scanned: 2026-07-02 · 50 customers — this is the **default, unsearched list**
 * (a recent subset). The tenant actually has MANY more customers: typing in the
 * "Search Name/Phone …" box queries the full customer database server-side
 * (verified via MCP — e.g. searching "Melanie" returns far more than the 50
 * here). So this snapshot is a convenient, stable pool of known names, NOT the
 * complete customer set.
 *
 * Purpose: let the booking tests pick ANY customer instead of hard-coding a
 * single one (e.g. "Kevin V"). Two ways to use this:
 *
 *   1. Static pick — choose a known customer from {@link CUSTOMERS} /
 *      {@link SELECTABLE_CUSTOMERS} (e.g. round-robin, by index, or random).
 *   2. Runtime/dynamic pick — {@link NewAppointmentModal.selectAnyCustomer}
 *      reads whatever customers the live app currently shows and selects one;
 *      {@link NewAppointmentModal.selectCustomer} filters via the search box so
 *      it can reach ANY customer by name, even ones outside this snapshot.
 *
 * Phones are always masked in the UI as `(***) ***-XXXX`; only the last 4
 * digits are exposed, captured here as `phoneLast4` for identification.
 */

export interface Customer {
  /** Display name exactly as shown on the customer card (used for exact-match select). */
  name: string;
  /** Avatar initials shown on the card (1–2 chars). */
  initials: string;
  /** Last 4 digits of the masked phone `(***) ***-XXXX`. */
  phoneLast4: string;
}

/** Full scanned customer list (default unsearched order in the New Appointment form). */
export const CUSTOMERS: readonly Customer[] = [
  { name: 'Kevin V', initials: 'KV', phoneLast4: '3972' },
  { name: 'Annie Khuu', initials: 'AK', phoneLast4: '1946' },
  { name: 'Anna Khuu', initials: 'AK', phoneLast4: '8476' },
  { name: 'Sharon Lombardo', initials: 'SL', phoneLast4: '9474' },
  { name: 'Sandra Cummings', initials: 'SC', phoneLast4: '6200' },
  { name: 'Brittany Haefner', initials: 'BH', phoneLast4: '9218' },
  { name: 'Jaylynn', initials: 'J', phoneLast4: '5979' },
  { name: 'H', initials: 'H', phoneLast4: '0298' },
  { name: 'Lori Cupp', initials: 'LC', phoneLast4: '7959' },
  { name: 'Amy Elkins', initials: 'AE', phoneLast4: '5450' },
  { name: 'Rochelle Stachel', initials: 'RS', phoneLast4: '6136' },
  { name: 'Cynthia', initials: 'C', phoneLast4: '6473' },
  { name: 'Maxine', initials: 'M', phoneLast4: '0408' },
  { name: 'Addison', initials: 'A', phoneLast4: '9108' },
  { name: 'viet', initials: 'V', phoneLast4: '3683' },
  { name: 'Aubre Cameron', initials: 'AC', phoneLast4: '3119' },
  { name: 'Amy Caprino', initials: 'AC', phoneLast4: '8365' },
  { name: 'Nicole Daugherty', initials: 'ND', phoneLast4: '6856' },
  { name: 'Andrea Moore', initials: 'AM', phoneLast4: '4306' },
  { name: 'Theresa', initials: 'T', phoneLast4: '2307' },
  { name: 'Elvira Vela', initials: 'EV', phoneLast4: '4065' },
  { name: 'Kris Jackson', initials: 'KJ', phoneLast4: '7199' },
  { name: 'Vicki', initials: 'V', phoneLast4: '5491' },
  { name: 'Michelle', initials: 'M', phoneLast4: '9784' },
  { name: 'Krystle Colangelo', initials: 'KC', phoneLast4: '1924' },
  { name: 'Karan', initials: 'K', phoneLast4: '3163' },
  { name: 'Danielle', initials: 'D', phoneLast4: '3856' },
  { name: 'Diane Michel', initials: 'DM', phoneLast4: '5769' },
  { name: 'Sandy Yakovich', initials: 'SY', phoneLast4: '5015' },
  { name: 'Julie', initials: 'J', phoneLast4: '5323' },
  { name: 'Priscilla', initials: 'P', phoneLast4: '6542' },
  { name: 'Lauren Quallich', initials: 'LQ', phoneLast4: '6127' },
  { name: 'Barbara Mecca', initials: 'BM', phoneLast4: '5188' },
  { name: 'Debbie', initials: 'D', phoneLast4: '4493' },
  { name: 'Gabrielle diamond', initials: 'GD', phoneLast4: '9422' },
  { name: 'raquel diamond', initials: 'RD', phoneLast4: '9102' },
  { name: 'No name', initials: 'NN', phoneLast4: '5430' },
  { name: 'Brittany Mccoy', initials: 'BM', phoneLast4: '9447' },
  { name: 'Alyssa', initials: 'A', phoneLast4: '1640' },
  { name: 'Stephanie', initials: 'S', phoneLast4: '5491' },
  { name: 'Ellie Kairys', initials: 'EK', phoneLast4: '2383' },
  { name: 'Amanda', initials: 'A', phoneLast4: '6847' },
  { name: 'Lily', initials: 'L', phoneLast4: '1462' },
  { name: 'Maria Cindy Fisher', initials: 'MC', phoneLast4: '8328' },
  { name: 'Melanie D Temoshenka', initials: 'MD', phoneLast4: '3583' },
  { name: 'Amanda', initials: 'A', phoneLast4: '9116' },
  { name: 'Heather', initials: 'H', phoneLast4: '2929' },
  { name: 'Kiley', initials: 'K', phoneLast4: '1047' },
  { name: 'Taylor', initials: 'T', phoneLast4: '9465' },
  { name: 'Stephanie', initials: 'S', phoneLast4: '9017' },
] as const;

/** Every scanned customer name (may contain duplicates, e.g. two "Amanda"/"Stephanie"). */
export const CUSTOMER_NAMES: readonly string[] = CUSTOMERS.map((c) => c.name);

/**
 * Customers safe to select by exact name in a test: full, unique names only.
 * Excludes placeholders ("No name", "H", "viet") and names that repeat across
 * cards (an exact-name click would be ambiguous). Prefer these for the static
 * "pick a specific known customer" path; use `selectAnyCustomer` for a truly
 * dynamic pick against the live list.
 */
export const SELECTABLE_CUSTOMERS: readonly Customer[] = CUSTOMERS.filter((c, _i, all) => {
  const isUnique = all.filter((o) => o.name === c.name).length === 1;
  const isRealName = /^[A-Z][a-z]+(\s+\S+)+$/.test(c.name); // "First Last" style
  return isUnique && isRealName;
});

/**
 * Deterministically picks a customer name from {@link SELECTABLE_CUSTOMERS}.
 * Deterministic (no RNG) so test runs are reproducible; pass a `seed` (e.g. a
 * worker index or a timestamp injected by the caller) to vary the choice.
 */
export const pickCustomerName = (seed = 0): string => {
  const pool = SELECTABLE_CUSTOMERS.length > 0 ? SELECTABLE_CUSTOMERS : CUSTOMERS;
  const idx = ((seed % pool.length) + pool.length) % pool.length;
  return pool[idx].name;
};
