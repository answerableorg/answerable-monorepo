import { isAPIError } from "better-auth/api";
import type { NativeAdapter } from "./native-client-authentication.ts";
import { eq as sqlEq, sql } from "drizzle-orm";
import type { Executor } from "../db/client.ts";
import { revokeGrantContexts } from "../db/queries/grant-contexts.ts";
import { grantContexts } from "../db/schema/index.ts";

type Where = Parameters<NativeAdapter["deleteMany"]>[0]["where"];

/** Caller holds the grant row lock inside its transaction, after client authentication. */
export async function withNativeRefreshFamily<T>(
  adapter: NativeAdapter,
  tx: Executor,
  grant: { id: string; clientId: string; userId: string },
  run: (scoped: NativeAdapter) => Promise<T>,
  revocation = false,
): Promise<{ value: T } | { error: unknown }> {
  let invalidating = false;
  const eq = (w: Where[number], field: string, value: string) =>
    w.field === field &&
    w.value === value &&
    (w.operator === undefined || w.operator === "eq") &&
    (w.connector === undefined || w.connector === "AND");
  const names = (where: Where) =>
    where.some((w) => eq(w, "clientId", grant.clientId)) &&
    where.some((w) => eq(w, "userId", grant.userId));
  const ofGrant = {
    field: "referenceId",
    value: grant.id,
    connector: "AND",
  } as const;
  const scoped: NativeAdapter = {
    ...adapter,
    deleteMany: async (input) => {
      // The pinned native provider ends a family with three deletes by client and user:
      // the access tokens that hang off a refresh token, the refresh tokens, then the
      // access tokens again (native-shapes.test.ts). Keep its protocol decision, but
      // replace its client-and-user boundary with this grant.
      const familyAccess =
        input.model === "oauthAccessToken" &&
        input.where.length === 3 &&
        names(input.where) &&
        input.where.some(
          (w) =>
            w.field === "refreshId" && w.operator === "ne" && w.value === null,
        );
      const familyRefresh =
        input.model === "oauthRefreshToken" &&
        input.where.length === 2 &&
        names(input.where);
      if ((familyAccess || familyRefresh) && !invalidating) {
        await revokeGrantContexts(tx, sqlEq(grantContexts.id, grant.id));
        await tx.execute(sql`savepoint native_family_cleanup`);
        invalidating = true;
      }
      if (familyAccess) {
        // An access token names its grant only through its refresh token.
        const family = await adapter.findMany<{ id: string }>({
          model: "oauthRefreshToken",
          where: [
            ...input.where.filter((w) => w.field !== "refreshId"),
            ofGrant,
          ],
        });
        if (!family.length) return 0;
        return adapter.deleteMany({
          model: "oauthAccessToken",
          where: [
            {
              field: "refreshId",
              operator: "in",
              value: family.map((r) => r.id),
            },
          ],
        });
      }
      return adapter.deleteMany(
        input.model === "oauthRefreshToken"
          ? { ...input, where: [...input.where, ofGrant] }
          : input,
      );
    },
  };
  try {
    const value = await run(scoped);
    if (invalidating)
      await tx.execute(sql`release savepoint native_family_cleanup`);
    return { value };
  } catch (error) {
    if (!invalidating) throw error;
    // Failed cleanup must not undo the authoritative revocation barrier.
    // Native invalid_grant means cleanup completed; every other failure restores it.
    if (!(
      isAPIError(error) &&
      (error.body?.error === "invalid_grant" ||
        (revocation && error.body?.error === "invalid_request"))
    ))
      await tx.execute(sql`rollback to savepoint native_family_cleanup`);
    await tx.execute(sql`release savepoint native_family_cleanup`);
    return { error };
  }
}
