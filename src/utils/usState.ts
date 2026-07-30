/*
|--------------------------------------------------------------------------
| United States State Normalization
|--------------------------------------------------------------------------
|
| Address forms may receive either a full state name ("Iowa") or an
| abbreviation ("IA"). Persist only the official two-letter abbreviation so
| delivery geocoding, search, and user data always use one consistent value.
|
*/

const US_STATE_CODES: Record<string, string> = {
  alabama: "AL", alaska: "AK", arizona: "AZ", arkansas: "AR",
  california: "CA", colorado: "CO", connecticut: "CT", delaware: "DE",
  florida: "FL", georgia: "GA", hawaii: "HI", idaho: "ID", illinois: "IL",
  indiana: "IN", iowa: "IA", kansas: "KS", kentucky: "KY", louisiana: "LA",
  maine: "ME", maryland: "MD", massachusetts: "MA", michigan: "MI",
  minnesota: "MN", mississippi: "MS", missouri: "MO", montana: "MT",
  nebraska: "NE", nevada: "NV", "new hampshire": "NH", "new jersey": "NJ",
  "new mexico": "NM", "new york": "NY", "north carolina": "NC",
  "north dakota": "ND", ohio: "OH", oklahoma: "OK", oregon: "OR",
  pennsylvania: "PA", "rhode island": "RI", "south carolina": "SC",
  "south dakota": "SD", tennessee: "TN", texas: "TX", utah: "UT",
  vermont: "VT", virginia: "VA", washington: "WA", "west virginia": "WV",
  wisconsin: "WI", wyoming: "WY", "district of columbia": "DC", dc: "DC",
};

const validCodes = new Set(Object.values(US_STATE_CODES));

export function normalizeUsState(value: string): string | null {
  const normalized = value.trim().replace(/\s+/g, " ");

  if (!normalized) return null;

  const byName = US_STATE_CODES[normalized.toLowerCase()];

  if (byName) return byName;

  const code = normalized.toUpperCase();

  return validCodes.has(code) ? code : null;
}
