import {getFirestore} from "firebase-admin/firestore";
import {normalizeUsStateCode} from "../common/usStateCodes";

export interface DeliveryZoneAssignment {
  id: string;
  name: string;
}

function cityAssignmentKey(city: string, state: string): string {
  const slug = city.trim().normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `${state.toLowerCase()}_${slug}`;
}

function cityCandidates(city: string): string[] {
  const normalized = city.trim().replace(/\s+/g, " ");
  const candidates = new Set([normalized]);
  const replacements: Array<[RegExp, string]> = [
    [/^st\.?\s+/i, "Saint "], [/^saint\s+/i, "St "],
    [/^ft\.?\s+/i, "Fort "], [/^fort\s+/i, "Ft "],
    [/^mt\.?\s+/i, "Mount "], [/^mount\s+/i, "Mt "],
  ];
  for (const [pattern, replacement] of replacements) {
    if (pattern.test(normalized)) candidates.add(normalized.replace(pattern, replacement));
  }
  return [...candidates];
}

function editDistance(first: string, second: string): number {
  const previous = Array.from({length: second.length + 1}, (_, index) => index);
  for (let firstIndex = 1; firstIndex <= first.length; firstIndex += 1) {
    const current = [firstIndex];
    for (let secondIndex = 1; secondIndex <= second.length; secondIndex += 1) {
      current[secondIndex] = Math.min(
        current[secondIndex - 1] + 1,
        previous[secondIndex] + 1,
        previous[secondIndex - 1] + (first[firstIndex - 1] === second[secondIndex - 1] ? 0 : 1),
      );
    }
    previous.splice(0, previous.length, ...current);
  }
  return previous[second.length];
}

function citySlug(city: string): string {
  return city.trim().normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]/g, "");
}

export async function resolveDeliveryZoneForAddress(
  cityValue: unknown,
  stateValue: unknown,
  zipValue?: unknown,
  placeIdValue?: unknown,
): Promise<DeliveryZoneAssignment | null> {
  const city = typeof cityValue === "string" ? cityValue.trim() : "";
  const state = normalizeUsStateCode(stateValue);
  if (!city || !state) return null;
  const db = getFirestore("default");
  const zip = typeof zipValue === "string" ? zipValue.trim().slice(0, 5) : "";
  const placeId = typeof placeIdValue === "string" ? placeIdValue.trim() : "";
  let zoneId = "";
  if (placeId) {
    const match = await db.collection("deliveryZones").where("placeIds", "array-contains", placeId).limit(1).get();
    zoneId = match.docs[0]?.id ?? "";
  }
  if (!zoneId && /^\d{5}$/.test(zip)) {
    const match = await db.collection("deliveryZones").where("postalCodes", "array-contains", zip).limit(1).get();
    zoneId = match.docs[0]?.id ?? "";
  }
  if (!zoneId) {
    const assignments = await Promise.all(cityCandidates(city).map((candidate) =>
      db.collection("deliveryZoneCityAssignments").doc(cityAssignmentKey(candidate, state)).get()
    ));
    const assignment = assignments.find((snapshot) => snapshot.exists);
    zoneId = assignment && typeof assignment.data()?.zoneId === "string"
      ? assignment.data()!.zoneId.trim() : "";
  }
  if (!zoneId) {
    const target = citySlug(city);
    const maximumDistance = target.length >= 8 ? 2 : 1;
    const candidates = await db.collection("deliveryZoneCityAssignments")
      .where("stateCode", "==", state).limit(250).get();
    const closeMatches = candidates.docs.filter((document) => {
      const assignedCity = document.data().cityName;
      return typeof assignedCity === "string" && editDistance(target, citySlug(assignedCity)) <= maximumDistance;
    });
    const matchedZoneIds = [...new Set(closeMatches.map((document) => document.data().zoneId)
      .filter((value): value is string => typeof value === "string" && Boolean(value.trim())))];
    // A typo is accepted only when it identifies exactly one zone in the state.
    if (matchedZoneIds.length === 1) zoneId = matchedZoneIds[0];
  }
  if (!zoneId) return null;
  const zone = await db.collection("deliveryZones").doc(zoneId).get();
  if (!zone.exists || zone.data()?.isActive !== true) return null;
  const name = typeof zone.data()?.name === "string" ? zone.data()!.name.trim() : "";
  return {id: zone.id, name: name || "Delivery zone"};
}

export function zoneFields(zone: DeliveryZoneAssignment | null) {
  return {deliveryZoneId: zone?.id ?? null, deliveryZoneName: zone?.name ?? null};
}
