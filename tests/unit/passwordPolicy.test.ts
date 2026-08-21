import {describe, expect, it} from "vitest";
import {getPasswordPolicyError} from "../../src/utils/passwordPolicy";

describe("shared password policy", () => {
  it.each([
    ["Short1!", "at least 8"],
    ["lowercase1!", "uppercase"],
    ["NoNumber!", "number"],
    ["NoSymbol1", "special character"],
  ])("rejects %s", (password, expectedMessage) => {
    expect(getPasswordPolicyError(password)).toContain(expectedMessage);
  });

  it("accepts a password meeting every requirement", () => {
    expect(getPasswordPolicyError("StrongPass1!")).toBeNull();
  });
});
