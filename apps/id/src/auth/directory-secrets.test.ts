import { expect, test } from "bun:test";
import { symmetricDecrypt } from "better-auth/crypto";
import {
  applicationKey,
  openOidcConfig,
  openSsoProviderRow,
  sealOidcConfig,
} from "./directory-secrets.ts";

const single = applicationKey({
  betterAuthSecret: "single-secret-of-at-least-thirty-two-characters",
  betterAuthSecrets: undefined,
});
const ring = (...versions: number[]) =>
  applicationKey({
    betterAuthSecret: "single-secret-of-at-least-thirty-two-characters",
    betterAuthSecrets: versions.map((version) => ({
      version,
      value: `ring-secret-${version}-of-at-least-thirty-two-characters`,
    })),
  });
const config = JSON.stringify({
  issuer: "https://login.example.com",
  clientId: "own-client",
  clientSecret: "own-secret",
});

test("the key is Better Auth's: the single secret, or the ring with its first entry writing", () => {
  expect(single).toBe("single-secret-of-at-least-thirty-two-characters");
  expect(ring(2, 1)).toEqual({
    keys: new Map([
      [2, "ring-secret-2-of-at-least-thirty-two-characters"],
      [1, "ring-secret-1-of-at-least-thirty-two-characters"],
    ]),
    currentVersion: 2,
    legacySecret: "single-secret-of-at-least-thirty-two-characters",
  });
});

test("a sealed secret is stored only encrypted and opens to the same configuration", async () => {
  for (const key of [single, ring(1)]) {
    const sealed = await sealOidcConfig(config, key);
    expect(sealed).not.toContain("own-secret");
    expect(JSON.parse(sealed)).not.toHaveProperty("clientSecret");
    const { encryptedClientSecret } = JSON.parse(sealed);
    expect(await symmetricDecrypt({ key, data: encryptedClientSecret })).toBe(
      "own-secret",
    );
    expect(JSON.parse(await openOidcConfig(sealed, key))).toEqual(
      JSON.parse(config),
    );
  }
});

test("a rotation keeps sealed secrets readable while the old secret stays in the ring", async () => {
  const sealedUnderSingle = await sealOidcConfig(config, single);
  const sealedUnderOne = await sealOidcConfig(config, ring(1));
  for (const sealed of [sealedUnderSingle, sealedUnderOne])
    expect(JSON.parse(await openOidcConfig(sealed, ring(2, 1)))).toEqual(
      JSON.parse(config),
    );
  await expect(openOidcConfig(sealedUnderOne, ring(2))).rejects.toThrow(
    "not found in keys",
  );
});

test("configurations without a secret pass through unchanged, older plaintext rows included", async () => {
  const platform = JSON.stringify({ credentials: "platform" });
  for (const value of [platform, "null", "1", config]) {
    if (value !== config)
      expect(await sealOidcConfig(value, single)).toBe(value);
    expect(await openOidcConfig(value, single)).toBe(value);
  }
});

test("the adapter's rows open their configuration and leave everything else alone", async () => {
  const sealed = await sealOidcConfig(config, single);
  expect(
    JSON.parse(
      (await openSsoProviderRow({ id: "row", oidcConfig: sealed }, single))
        .oidcConfig,
    ),
  ).toEqual(JSON.parse(config));
  for (const row of [
    null,
    undefined,
    "row",
    {},
    { oidcConfig: null },
    { oidcConfig: "not json" },
  ])
    expect(await openSsoProviderRow(row, single)).toBe(row);
  // A secret this key cannot open fails the read rather than signing in without it.
  await expect(
    openSsoProviderRow(
      { oidcConfig: sealed },
      "another-secret-of-at-least-thirty-two-characters",
    ),
  ).rejects.toThrow();
});
