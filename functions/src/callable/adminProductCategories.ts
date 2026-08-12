import * as admin from "firebase-admin";
import {randomUUID} from "crypto";
import {FieldValue, getFirestore} from "firebase-admin/firestore";
import {getStorage} from "firebase-admin/storage";
import {HttpsError, onCall} from "firebase-functions/v2/https";
import sharp from "sharp";
import {requireAdminPermission} from "../admin/adminAuthorizationService";
import {writeAdminAuditLog} from "../admin/adminAuditLogService";

if (admin.apps.length === 0) admin.initializeApp();
const db = getFirestore("default");
const MAX_ICON_BYTES = 3 * 1024 * 1024;

function text(value: unknown, maximum = 100): string {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, maximum) : "";
}

function categoryId(value: unknown): string {
  const id = text(value, 100);
  if (!id || id.includes("/")) throw new HttpsError("invalid-argument", "A valid product category is required.");
  return id;
}

function slug(value: string): string {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);
}

async function requireUniqueName(name: string, excludedId?: string): Promise<void> {
  const normalizedName = name.toLowerCase();
  const snapshot = await db.collection("categories").limit(250).get();
  if (snapshot.docs.some((document) => document.id !== excludedId && text(document.data().name).toLowerCase() === normalizedName)) {
    throw new HttpsError("already-exists", "A product category with this name already exists.");
  }
}

export const getAdminProductCategories = onCall({region: "us-central1"}, async (request) => {
  await requireAdminPermission(request, "product_categories");
  const snapshot = await db.collection("categories").limit(250).get();
  return {categories: snapshot.docs.map((document) => ({id: document.id, name: text(document.data().name) || "Unnamed category", iconUrl: text(document.data().iconUrl, 2_000), freshnessEligible: document.data().freshnessEligible === true})).sort((first, second) => first.name.localeCompare(second.name))};
});

export const createAdminProductCategory = onCall({region: "us-central1"}, async (request) => {
  const administrator = await requireAdminPermission(request, "product_categories", "write");
  const input = request.data && typeof request.data === "object" ? request.data as Record<string, unknown> : {};
  const name = text(input.name);
  const freshnessEligible = input.freshnessEligible === true;
  const id = slug(name);
  if (name.length < 2 || !id) throw new HttpsError("invalid-argument", "Enter a category name with at least two characters.");
  await requireUniqueName(name);
  const reference = db.collection("categories").doc(id);
  try {
    await reference.create({name, freshnessEligible, normalizedName: name.toLowerCase(), createdAt: FieldValue.serverTimestamp(), createdBy: administrator.uid, updatedAt: FieldValue.serverTimestamp(), updatedBy: administrator.uid});
  } catch (error) {
    if ((error as {code?: unknown}).code === 6 || (error as {code?: unknown}).code === "already-exists") {
      throw new HttpsError("already-exists", "That category ID is already in use. Edit the existing category instead.");
    }
    throw error;
  }
  await writeAdminAuditLog(administrator, {action: "product_category.created", targetType: "productCategory", targetId: id, details: {name}});
  return {id};
});

export const updateAdminProductCategory = onCall({region: "us-central1"}, async (request) => {
  const administrator = await requireAdminPermission(request, "product_categories", "write");
  const input = request.data && typeof request.data === "object" ? request.data as Record<string, unknown> : {};
  const id = categoryId(input.id);
  const name = text(input.name);
  const freshnessEligible = input.freshnessEligible === true;
  if (name.length < 2) throw new HttpsError("invalid-argument", "Enter a category name with at least two characters.");
  const reference = db.collection("categories").doc(id);
  const existing = await reference.get();
  if (!existing.exists) throw new HttpsError("not-found", "Product category not found.");
  await requireUniqueName(name, id);
  await reference.update({name, freshnessEligible, normalizedName: name.toLowerCase(), icon: FieldValue.delete(), updatedAt: FieldValue.serverTimestamp(), updatedBy: administrator.uid});
  await writeAdminAuditLog(administrator, {action: "product_category.renamed", targetType: "productCategory", targetId: id, details: {previousName: text(existing.data()?.name), name}});
  return {success: true};
});

function inferredName(id: string): string {
  return id.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export const importAdminProductCategories = onCall({region: "us-central1"}, async (request) => {
  const administrator = await requireAdminPermission(request, "product_categories", "write");
  const [products, categories] = await Promise.all([
    db.collection("products").select("category").get(),
    db.collection("categories").get(),
  ]);
  const existingIds = new Set(categories.docs.map((document) => document.id));
  const ids = [...new Set(products.docs.map((document) => text(document.data().category)).filter((id) => id && !id.includes("/")))]
    .filter((id) => !existingIds.has(id));
  for (let start = 0; start < ids.length; start += 450) {
    const batch = db.batch();
    ids.slice(start, start + 450).forEach((id) => {
      const name = inferredName(id) || id;
      batch.create(db.collection("categories").doc(id), {
        name,
        normalizedName: name.toLowerCase(),
        freshnessEligible: false,
        createdAt: FieldValue.serverTimestamp(),
        createdBy: administrator.uid,
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: administrator.uid,
        source: "existing_products_import",
      });
    });
    await batch.commit();
  }
  await writeAdminAuditLog(administrator, {action: "product_categories.imported", targetType: "productCategory", targetId: "existing-products", details: {created: ids.length, productsScanned: products.size}});
  return {success: true, created: ids.length, productsScanned: products.size};
});

function decodeIcon(value: unknown): Buffer {
  const encoded = text(value, 5_000_000);
  if (!encoded || !/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)) {
    throw new HttpsError("invalid-argument", "Choose a valid category image.");
  }
  const bytes = Buffer.from(encoded, "base64");
  if (bytes.length === 0 || bytes.length > MAX_ICON_BYTES) {
    throw new HttpsError("invalid-argument", "Category images must be no larger than 3 MB.");
  }
  return bytes;
}

function downloadUrl(bucketName: string, path: string, token: string): string {
  return `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodeURIComponent(path)}?alt=media&token=${token}`;
}

export const uploadAdminProductCategoryIcon = onCall(
  {region: "us-central1", memory: "512MiB", timeoutSeconds: 60},
  async (request) => {
    const administrator = await requireAdminPermission(request, "product_categories", "write");
    const input = request.data && typeof request.data === "object" ? request.data as Record<string, unknown> : {};
    const id = categoryId(input.id);
    const contentType = text(input.contentType).toLowerCase();
    if (!["image/jpeg", "image/png", "image/webp", "image/avif"].includes(contentType)) {
      throw new HttpsError("invalid-argument", "Choose a JPG, PNG, WebP, or AVIF category image.");
    }

    const reference = db.collection("categories").doc(id);
    const existing = await reference.get();
    if (!existing.exists) throw new HttpsError("not-found", "Product category not found.");

    let optimized: Buffer;
    try {
      optimized = await sharp(decodeIcon(input.base64))
        .rotate()
        .resize({width: 192, height: 192, fit: "contain", withoutEnlargement: true})
        .webp({quality: 82, effort: 4})
        .toBuffer();
    } catch (error) {
      if (error instanceof HttpsError) throw error;
      throw new HttpsError("invalid-argument", "The selected category image could not be processed.");
    }

    const bucket = getStorage().bucket();
    const path = `product-categories/${id}/icons/${Date.now()}-${randomUUID()}.webp`;
    const token = randomUUID();
    await bucket.file(path).save(optimized, {
      resumable: false,
      metadata: {
        contentType: "image/webp",
        cacheControl: "public, max-age=31536000, immutable",
        metadata: {firebaseStorageDownloadTokens: token, uploadedBy: administrator.uid},
      },
    });
    const iconUrl = downloadUrl(bucket.name, path, token);
    await reference.update({
      iconUrl,
      iconStoragePath: path,
      icon: FieldValue.delete(),
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: administrator.uid,
    });

    const previousPath = text(existing.data()?.iconStoragePath, 1_000);
    if (previousPath && previousPath !== path) {
      await bucket.file(previousPath).delete({ignoreNotFound: true});
    }
    await writeAdminAuditLog(administrator, {action: "product_category.icon_uploaded", targetType: "productCategory", targetId: id});
    return {success: true, iconUrl};
  },
);
