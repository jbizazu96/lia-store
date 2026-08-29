import {createHash} from "node:crypto";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {describe, expect, it} from "vitest";
import {
  CUSTOMER_TERMS_DOCUMENT_HASH,
  CUSTOMER_TERMS_DOCUMENT_PATH,
  CUSTOMER_TERMS_VERSION,
} from "../../src/config/customerLegal";
import {customerTermsSections} from "../../src/content/legal/customerTerms";
import {
  CUSTOMER_PRIVACY_DOCUMENT_HASH,
  CUSTOMER_PRIVACY_DOCUMENT_PATH,
  CUSTOMER_PRIVACY_VERSION,
} from "../../src/config/privacyLegal";
import {customerPrivacySections} from "../../src/content/legal/customerPrivacy";

describe("customer legal document", () => {
  it("publishes a complete, versioned customer agreement", () => {
    expect(CUSTOMER_TERMS_VERSION).toBe("customer-terms-v3");
    expect(CUSTOMER_TERMS_DOCUMENT_PATH).toBe("/legal/customer-terms");
    expect(customerTermsSections.length).toBeGreaterThanOrEqual(30);
    expect(customerTermsSections.at(-1)?.title).toContain("Contact LIA");
  });

  it("keeps the acceptance hash tied to the exact terms source", () => {
    const source = readFileSync(
      resolve(process.cwd(), "src/content/legal/customerTerms.ts"),
    );
    const hash = createHash("sha256").update(source).digest("hex");
    expect(CUSTOMER_TERMS_DOCUMENT_HASH).toBe(`sha256:${hash}`);
  });

  it("publishes a complete, versioned customer privacy policy", () => {
    expect(CUSTOMER_PRIVACY_VERSION).toBe("customer-privacy-v2");
    expect(CUSTOMER_PRIVACY_DOCUMENT_PATH).toBe("/legal/privacy");
    expect(customerPrivacySections.length).toBeGreaterThanOrEqual(26);
    expect(customerPrivacySections.at(-1)?.title).toContain("Contact LIA");
  });

  it("keeps the privacy acknowledgment hash tied to the exact policy source", () => {
    const source = readFileSync(
      resolve(process.cwd(), "src/content/legal/customerPrivacy.ts"),
    );
    const hash = createHash("sha256").update(source).digest("hex");
    expect(CUSTOMER_PRIVACY_DOCUMENT_HASH).toBe(`sha256:${hash}`);
  });
});
