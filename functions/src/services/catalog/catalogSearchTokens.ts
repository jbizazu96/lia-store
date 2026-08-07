/*
|--------------------------------------------------------------------------
| Public Catalog Search Tokens
|--------------------------------------------------------------------------
|
| Firestore does not provide full-text search. Public catalog projections keep
| compact normalized prefixes so customer search can use an indexed
| array-contains query without exposing private store or product records.
|
*/

const MINIMUM_PREFIX_LENGTH = 2;
const MAXIMUM_PREFIX_LENGTH = 40;
const MAXIMUM_TOKEN_COUNT = 120;

export function normalizeCatalogSearchText(
  value: unknown
): string {
  if (typeof value !== "string") {
    return "";
  }

  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function addPrefixes(
  tokens: Set<string>,
  value: string
): void {
  const maximumLength = Math.min(
    value.length,
    MAXIMUM_PREFIX_LENGTH
  );

  for (
    let length = MINIMUM_PREFIX_LENGTH;
    length <= maximumLength &&
    tokens.size < MAXIMUM_TOKEN_COUNT;
    length += 1
  ) {
    tokens.add(value.slice(0, length));
  }
}

export function createCatalogSearchTokens(
  values: unknown[]
): string[] {
  const tokens = new Set<string>();

  values.forEach((value) => {
    const normalized = normalizeCatalogSearchText(value);

    if (!normalized) {
      return;
    }

    addPrefixes(tokens, normalized);
    normalized.split(" ").forEach((word) => {
      addPrefixes(tokens, word);
    });
  });

  return Array.from(tokens);
}
