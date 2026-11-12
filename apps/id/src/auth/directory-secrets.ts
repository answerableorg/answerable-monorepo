import {
  symmetricDecrypt,
  symmetricEncrypt,
  type SecretConfig,
} from "better-auth/crypto";
import type { Environment } from "../env.ts";

export type ApplicationKey = string | SecretConfig;

/**
 * The key Better Auth encrypts what it stores with, signing keys among them: with a ring, its
 * first entry writes, every entry reads, and the single secret reads what was written before the
 * ring. The same secrets give the same key, so a rotation treats both alike.
 */
export function applicationKey({
  betterAuthSecret,
  betterAuthSecrets,
}: Pick<
  Environment,
  "betterAuthSecret" | "betterAuthSecrets"
>): ApplicationKey {
  if (!betterAuthSecrets) return betterAuthSecret;
  return {
    keys: new Map(
      betterAuthSecrets.map(({ version, value }) => [version, value]),
    ),
    currentVersion: betterAuthSecrets[0]!.version,
    legacySecret: betterAuthSecret,
  };
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

/**
 * An `oidc_config` as stored: an organisation's own client secret, when it has one, is held
 * encrypted as `encryptedClientSecret`, so a read of the column or a backup never holds it.
 */
export async function sealOidcConfig(
  config: string,
  key: ApplicationKey,
): Promise<string> {
  const parsed: unknown = JSON.parse(config);
  if (!isRecord(parsed)) return config;
  const data = parsed.clientSecret;
  if (typeof data !== "string") return config;
  const rest = { ...parsed };
  delete rest.clientSecret;
  return JSON.stringify({
    ...rest,
    encryptedClientSecret: await symmetricEncrypt({ key, data }),
  });
}

/**
 * The stored `oidc_config` with its client secret in the clear, as the SSO plugin and the
 * provider commands read it. A row written before secrets were sealed holds `clientSecret`
 * itself and is returned as it is.
 */
export async function openOidcConfig(
  config: string,
  key: ApplicationKey,
): Promise<string> {
  const parsed: unknown = JSON.parse(config);
  if (!isRecord(parsed)) return config;
  const data = parsed.encryptedClientSecret;
  if (typeof data !== "string") return config;
  const rest = { ...parsed };
  delete rest.encryptedClientSecret;
  return JSON.stringify({
    ...rest,
    clientSecret: await symmetricDecrypt({ key, data }),
  });
}

/** A provider row as the adapter hands it to the SSO plugin: its configuration opened. */
export async function openSsoProviderRow<T>(
  row: T,
  key: ApplicationKey,
): Promise<T> {
  if (
    !row ||
    typeof row !== "object" ||
    !("oidcConfig" in row) ||
    typeof row.oidcConfig !== "string"
  )
    return row;
  let oidcConfig;
  try {
    oidcConfig = await openOidcConfig(row.oidcConfig, key);
  } catch (error) {
    // Malformed JSON is the plugin's to refuse, as before; a secret that will not
    // decrypt is a custody failure and fails the sign-in.
    if (error instanceof SyntaxError) return row;
    throw error;
  }
  return { ...row, oidcConfig };
}
