/*
  Store Onboarding Service.

  Owns the onboarding persistence flow: creating the pending store,
  validating/geocoding addresses, uploading non-product images through
  the resizer pipeline, and advancing the saved onboarding step.

  UI components must call this service rather than writing directly to
  Firestore or Firebase Storage.
*/
import { collection, doc, getDoc, getDocs, limit, query, serverTimestamp, setDoc, updateDoc, where } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { PRICING_CONFIG } from "@/config/pricing";
import { geocodeAddress } from "@/services/delivery/geocode";
import { normalizeUsState } from "@/utils/usState";
import { mapStoreOnboardingDraft } from "@/mappers/storeOnboardingMapper";
import { getStoreScheduleValidationError } from "@/services/store/storeScheduleValidation";
import { storeImageService } from "./storeImageService";
import type { StoreScheduleDay } from "@/types/store";
import type { StoreDocumentReview, StoreOnboardingDraft, StoreOwnerOnboardingInfo, StoreOnboardingStep } from "@/types/storeOnboarding";

/* Normalize address values consistently before saving to Firestore. */
const upper = (value: string) => value.trim().toUpperCase();

/* Build the address string passed to the shared geocoding service. */
const fullAddress = (value: Pick<StoreOwnerOnboardingInfo, "address" | "city" | "state" | "zip">) => `${value.address}, ${value.city}, ${value.state} ${value.zip}`;

function requireOwnedStoreOwnerId(ownerId: string): string {
  const normalizedOwnerId = ownerId.trim();
  const currentUser = auth.currentUser;

  if (!currentUser || currentUser.uid !== normalizedOwnerId) {
    throw new Error("You are not authorized to update this store application.");
  }

  return normalizedOwnerId;
}

function pendingPhotoIdReview(): StoreDocumentReview {
  return {
    reviewStatus: "pending",
    rejectionReason: null,
    reviewedAt: null,
    reviewedBy: null,
  };
}

function getPhotoIdReview(value: unknown): StoreDocumentReview {
  if (!value || typeof value !== "object") return pendingPhotoIdReview();

  const review = value as Partial<StoreDocumentReview>;

  return {
    reviewStatus: review.reviewStatus === "approved" || review.reviewStatus === "rejected" || review.reviewStatus === "expired" || review.reviewStatus === "pending"
      ? review.reviewStatus
      : "pending",
    rejectionReason: typeof review.rejectionReason === "string"
      ? review.rejectionReason
      : null,
    reviewedAt: review.reviewedAt ?? null,
    reviewedBy: typeof review.reviewedBy === "string"
      ? review.reviewedBy
      : null,
  };
}

/*
  Resolve the store owned by this authenticated user.

  The user document is checked first for efficiency, then the stores
  collection is queried as a safe fallback for older store records.
*/
async function ownedStore(ownerId: string) {
  ownerId = requireOwnedStoreOwnerId(ownerId);
  const user = await getDoc(doc(db, "users", ownerId));
  const storeId = user.data()?.storeId;
  if (typeof storeId === "string" && storeId) {
    const store = await getDoc(doc(db, "stores", storeId));
    if (store.exists() && store.data().ownerId === ownerId) return store;
  }
  const snapshot = await getDocs(query(collection(db, "stores"), where("ownerId", "==", ownerId), limit(1)));
  return snapshot.docs[0] ?? null;
}

/*
  Store Application Completion Validation.

  Keep all submission requirements in one place so a store owner cannot
  complete onboarding by opening the Stripe route before earlier steps are
  safely saved.
*/
function requireCompleteStoreApplication(
  draft: StoreOnboardingDraft
): void {
  const missingSections: string[] = [];

  if (
    !draft.owner.firstName ||
    !draft.owner.lastName ||
    !draft.owner.email ||
    !draft.owner.phone ||
    !draft.owner.address ||
    !draft.owner.city ||
    !draft.owner.state ||
    !draft.owner.zip ||
    !draft.owner.formattedAddress ||
    !draft.owner.photoIdUrl
  ) {
    missingSections.push("owner information");
  }

  if (
    !draft.name ||
    !draft.email ||
    !draft.phone ||
    !draft.description ||
    !draft.address ||
    !draft.city ||
    !draft.state ||
    !draft.zip ||
    !draft.formattedAddress ||
    !draft.logoUrl
  ) {
    missingSections.push("store information");
  }

  if (
    !draft.businessType ||
    !draft.registeredName ||
    !draft.businessStructure ||
    !draft.storeFrontUrl ||
    !draft.storeInsideUrl
  ) {
    missingSections.push("business information");
  }

  if (getStoreScheduleValidationError(draft.schedule)) {
    missingSections.push("business schedule");
  }

  if (
    !draft.stripeAccountId ||
    !draft.stripeDetailsSubmitted ||
    !draft.stripeTransfersEnabled
  ) {
    missingSections.push("Stripe payment setup");
  }

  if (missingSections.length > 0) {
    throw new Error(
      `Complete the following before submitting your store: ${missingSections.join(
        ", "
      )}.`
    );
  }
}

export const storeOnboardingService = {
  async getDraft(ownerId: string): Promise<StoreOnboardingDraft> {
    const store = await ownedStore(ownerId);
    return mapStoreOnboardingDraft(store?.id ?? null, ownerId, store?.data());
  },

  async saveOwner(ownerId: string, owner: StoreOwnerOnboardingInfo, photoIdFile: File | null): Promise<StoreOnboardingDraft> {
    ownerId = requireOwnedStoreOwnerId(ownerId);
    const state = normalizeUsState(owner.state);
    if (!owner.firstName.trim() || !owner.lastName.trim() || !owner.email.trim() || !owner.phone.trim() || !owner.address.trim() || !owner.city.trim() || !state || !owner.zip.trim()) throw new Error("Complete every required owner field with a valid two-letter state.");
    const location = await geocodeAddress(fullAddress(owner));
    if (!location) throw new Error("We couldn't verify your home address. Check the street, city, state, and ZIP code.");
    const existing = await ownedStore(ownerId);
    const storeReference = existing?.ref ?? doc(collection(db, "stores"));
    const existingStoreData = existing?.data();
    const existingOwner = existingStoreData?.owner;
    const existingPhotoIdUrl = existingOwner?.photoIdUrl;
    if (!photoIdFile && !existingPhotoIdUrl) throw new Error("Upload a photo ID.");

    /*
      A new store needs an owned Firestore document before the authenticated
      image route can accept its upload. This shell remains on the owner step
      and never advances the application by itself.
    */
    if (!existing) {
      await setDoc(storeReference, {
        ownerId,
        owner: {
          photoIdReview: pendingPhotoIdReview(),
          photoIdSubmissionVersion: 0,
        },
        isApproved: false,
        isActive: false,
        status: "draft",
        onboardingCompleted: false,
        onboardingStep: "owner",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    const photoIdChanged = Boolean(photoIdFile) || !existingPhotoIdUrl;

    /* Upload the required image before saving data that advances this step. */
    if (photoIdFile) {
      await storeImageService.uploadOriginalImage({
        storeId: storeReference.id,
        field: "owner-photo-id",
        file: photoIdFile,
      });
    }

    const photoIdReview = photoIdChanged
      ? pendingPhotoIdReview()
      : getPhotoIdReview(existingOwner?.photoIdReview);

    /*
      Use dotted fields so the asynchronous image processor cannot lose an
      optimized photo ID URL while this owner metadata is being persisted.
    */
    await updateDoc(storeReference, {
      ownerId,
      "owner.firstName": owner.firstName.trim(),
      "owner.lastName": owner.lastName.trim(),
      "owner.email": owner.email.trim(),
      "owner.phone": owner.phone.trim(),
      "owner.address": upper(owner.address),
      "owner.city": upper(owner.city),
      "owner.state": state,
      "owner.zip": upper(owner.zip),
      "owner.formattedAddress": (location.formattedAddress || fullAddress(owner)).toUpperCase(),
      "owner.photoIdReview": photoIdReview,
      "owner.photoIdSubmissionVersion":
        Number(existingOwner?.photoIdSubmissionVersion ?? 0) +
        (photoIdChanged ? 1 : 0),
      /*
        Preserve lifecycle and operating fields for an existing store.

        A new application starts incomplete, on the store-information step,
        and closed. Updating an existing approved store must not reset its
        onboarding state or force it closed.
      */
      isApproved: existingStoreData?.isApproved === true,
      isActive: existingStoreData?.isActive === true,
      status: existingStoreData?.status ?? "draft",
      onboardingCompleted: existingStoreData?.onboardingCompleted === true,
      onboardingStep: existingStoreData?.onboardingCompleted === true
        ? existingStoreData.onboardingStep ?? "stripe"
        : "store-information",
      minimumOrder:
        existingStoreData?.minimumOrder ?? PRICING_CONFIG.DEFAULT_MINIMUM_ORDER,
      isOpen: existingStoreData?.isOpen === true,
      updatedAt: serverTimestamp(),
    });

    await setDoc(doc(db, "users", ownerId), {
      storeId: storeReference.id,
      onboardingCompleted: existingStoreData?.onboardingCompleted === true,
      displayName: `${owner.firstName.trim()} ${owner.lastName.trim()}`,
      email: owner.email.trim(), phone: owner.phone.trim(), defaultAddress: { street: upper(owner.address), city: upper(owner.city), state, zip: upper(owner.zip), latitude: location.latitude, longitude: location.longitude, formattedAddress: (location.formattedAddress || fullAddress(owner)).toUpperCase() }, updatedAt: serverTimestamp(),
    }, { merge: true });
    return this.getDraft(ownerId);
  },

  async saveStoreInformation(ownerId: string, input: { name: string; email: string; phone: string; description: string; address: string; city: string; state: string; zip: string; logo: File | null; banner?: File | null; }): Promise<StoreOnboardingDraft> {
    const store = await ownedStore(ownerId);
    if (!store) throw new Error("Complete owner information first.");
    const state = normalizeUsState(input.state);
    if (!input.name.trim() || !input.email.trim() || !input.phone.trim() || !input.description.trim() || !input.address.trim() || !input.city.trim() || !state || !input.zip.trim()) throw new Error("Complete every required store field with a valid two-letter state.");
    const location = await geocodeAddress(fullAddress(input));
    if (!location) throw new Error("We couldn't verify the store address. Check the street, city, state, and ZIP code.");
    if (!input.logo && !store.data().logoUrl) throw new Error("Upload a store logo.");

    /* Required and optional replacements are accepted before this step advances. */
    await Promise.all([
      input.logo
        ? storeImageService.uploadOriginalImage({
          storeId: store.id,
          field: "logo",
          file: input.logo,
        })
        : Promise.resolve(),
      input.banner
        ? storeImageService.uploadOriginalImage({
          storeId: store.id,
          field: "banner",
          file: input.banner,
        })
        : Promise.resolve(),
    ]);

    await updateDoc(store.ref, { name: input.name.trim(), email: input.email.trim(), phone: input.phone.trim(), description: input.description.trim(), address: upper(input.address), city: upper(input.city), state, zip: upper(input.zip), country: "US", latitude: location.latitude, longitude: location.longitude, placeId: location.placeId ?? "", formattedAddress: (location.formattedAddress || fullAddress(input)).toUpperCase(), onboardingStep: "business-information", updatedAt: serverTimestamp() });
    return this.getDraft(ownerId);
  },

  async saveBusinessInformation(ownerId: string, input: { businessType: string; registeredName: string; ein: string; businessStructure: string; storeFront: File | null; storeInside: File | null; }): Promise<StoreOnboardingDraft> {
    const store = await ownedStore(ownerId);
    if (!store) throw new Error("Complete owner information first.");
    if (!input.businessType || !input.registeredName.trim() || !input.businessStructure || (!input.storeFront && !store.data().storeFrontUrl) || (!input.storeInside && !store.data().storeInsideUrl)) throw new Error("Complete every required business field and upload store front and inside photos.");

    /* Do not advance to scheduling until both required uploads are accepted. */
    await Promise.all([
      input.storeFront
        ? storeImageService.uploadOriginalImage({
          storeId: store.id,
          field: "front",
          file: input.storeFront,
        })
        : Promise.resolve(),
      input.storeInside
        ? storeImageService.uploadOriginalImage({
          storeId: store.id,
          field: "inside",
          file: input.storeInside,
        })
        : Promise.resolve(),
    ]);

    await updateDoc(store.ref, { businessType: input.businessType, registeredName: input.registeredName.trim(), ein: input.ein.trim() || null, businessStructure: input.businessStructure, stripeBusinessType: input.businessType, stripeAccountType: input.businessStructure === "sole_proprietorship" || input.businessStructure === "dba" ? "individual" : "company", onboardingStep: "schedule", updatedAt: serverTimestamp() });
    return this.getDraft(ownerId);
  },

  async saveSchedule(ownerId: string, schedule: StoreScheduleDay[]): Promise<StoreOnboardingDraft> {
    const store = await ownedStore(ownerId);
    if (!store) throw new Error("Complete owner information first.");

    const scheduleValidationError = getStoreScheduleValidationError(schedule);

    if (scheduleValidationError) throw new Error(scheduleValidationError);

    await updateDoc(store.ref, { schedule, isOpen: false, onboardingStep: "stripe", updatedAt: serverTimestamp() });
    return this.getDraft(ownerId);
  },

  async complete(ownerId: string): Promise<void> {
    const store = await ownedStore(ownerId);
    if (!store) throw new Error("Store draft not found.");

    const draft = mapStoreOnboardingDraft(store.id, ownerId, store.data());
    requireCompleteStoreApplication(draft);

    /* Finishing Stripe submits a new store for approval; never revoke an existing approval. */
    await updateDoc(store.ref, {
      onboardingCompleted: true,
      onboardingStep: "stripe",
      status: store.data().isApproved === true ? "approved" : "pending_review",
      isApproved: store.data().isApproved === true,
      isActive: store.data().isActive === true,
      submittedAt: store.data().submittedAt ?? serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    await setDoc(doc(db, "users", ownerId), { onboardingCompleted: true, storeId: store.id, updatedAt: serverTimestamp() }, { merge: true });
  },

  pathFor(step: StoreOnboardingStep) { return `/store/onboarding/${step}`; },
};
