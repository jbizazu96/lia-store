/*
|--------------------------------------------------------------------------
| Store Link Utilities
|--------------------------------------------------------------------------
|
| Builds reusable navigation and contact links for stores.
|
| These helpers contain no React or Firebase logic, so they can be reused
| across store pages, checkout, orders, admin tools, and future mobile views.
|
*/

/*
|--------------------------------------------------------------------------
| Store Link Input
|--------------------------------------------------------------------------
*/

interface StoreLinkData {
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  phone?: string;
}

/*
|--------------------------------------------------------------------------
| Build Full Address
|--------------------------------------------------------------------------
*/

export function buildStoreAddress({
  address,
  city,
  state,
  zip,
}: StoreLinkData): string {
  return [
    address,
    city,
    state,
    zip,
  ]
    .filter(
      (value): value is string =>
        typeof value === "string" &&
        value.trim().length > 0
    )
    .join(", ");
}

/*
|--------------------------------------------------------------------------
| Google Maps Search Link
|--------------------------------------------------------------------------
*/

export function getStoreMapsUrl(
  store: StoreLinkData
): string {
  const fullAddress =
    buildStoreAddress(store);

  if (!fullAddress) {
    return "#";
  }

  return (
    "https://www.google.com/maps/search/" +
    `?api=1&query=${encodeURIComponent(
      fullAddress
    )}`
  );
}

/*
|--------------------------------------------------------------------------
| Google Static Map Link
|--------------------------------------------------------------------------
*/

export function getStoreStaticMapUrl(
  store: StoreLinkData,
  apiKey?: string
): string {
  const fullAddress =
    buildStoreAddress(store);

  if (!fullAddress || !apiKey) {
    return "";
  }

  const encodedAddress =
    encodeURIComponent(fullAddress);

  return (
    "https://maps.googleapis.com/maps/api/staticmap" +
    `?center=${encodedAddress}` +
    "&zoom=15" +
    "&size=600x300" +
    `&markers=color:red%7C${encodedAddress}` +
    `&key=${encodeURIComponent(apiKey)}`
  );
}

/*
|--------------------------------------------------------------------------
| Phone Link
|--------------------------------------------------------------------------
*/

export function getStorePhoneUrl(
  phone?: string
): string {
  if (!phone?.trim()) {
    return "#";
  }

  const normalizedPhone =
    phone.replace(/[^\d+]/g, "");

  if (!normalizedPhone) {
    return "#";
  }

  return `tel:${normalizedPhone}`;
}