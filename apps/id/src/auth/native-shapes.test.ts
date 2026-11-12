import { expect, test } from "bun:test";

// The installed provider's built files, wherever the linker put the package.
const directory = new URL(
  "./",
  import.meta.resolve("@better-auth/oauth-provider"),
);

// A failure means the adapter interceptors must be re-verified before upgrading Better Auth.
test("the pinned native provider retains the query shapes intercepted by grant boundaries", async () => {
  const files = [
    ...new Bun.Glob("authorize-*.mjs").scanSync(directory.pathname),
  ];
  expect(files).toHaveLength(1);
  const source = await Bun.file(new URL(files[0]!, directory)).text();
  for (const fragment of [
    'async function invalidateRefreshFamily(ctx, clientId, userId) {\n\tconst deleteLinkedAccessTokens = () => ctx.context.adapter.deleteMany({\n\t\tmodel: "oauthAccessToken",\n\t\twhere: [\n\t\t\t{\n\t\t\t\tfield: "clientId",\n\t\t\t\tvalue: clientId\n\t\t\t},\n\t\t\t{\n\t\t\t\tfield: "userId",\n\t\t\t\tvalue: userId\n\t\t\t},\n\t\t\t{\n\t\t\t\tfield: "refreshId",\n\t\t\t\toperator: "ne",\n\t\t\t\tvalue: null\n\t\t\t}\n\t\t]\n\t});\n\tawait deleteLinkedAccessTokens();\n\tawait ctx.context.adapter.deleteMany({\n\t\tmodel: "oauthRefreshToken",\n\t\twhere: [{\n\t\t\tfield: "clientId",\n\t\t\tvalue: clientId\n\t\t}, {\n\t\t\tfield: "userId",\n\t\t\tvalue: userId\n\t\t}]\n\t});\n\tawait deleteLinkedAccessTokens();\n}',
    'async function revokeTokensIssuedForAuthorizationCode(ctx, authorizationCodeId) {\n\tconst deleteIssuedTokens = async (model) => {\n\t\ttry {\n\t\t\tawait ctx.context.adapter.deleteMany({\n\t\t\t\tmodel,\n\t\t\t\twhere: [{\n\t\t\t\t\tfield: "authorizationCodeId",\n\t\t\t\t\tvalue: authorizationCodeId\n\t\t\t\t}]\n\t\t\t});',
    'const accessToken = await ctx.context.adapter.findOne({\n\t\tmodel: "oauthAccessToken",\n\t\twhere: [{\n\t\t\tfield: "token",\n\t\t\tvalue: await getStoredToken(opts.storeTokens, tokenValue, "access_token")\n\t\t}]\n\t});',
    'async function validateRefreshToken(ctx, opts, token, clientId) {\n\tconst refreshToken = await ctx.context.adapter.findOne({\n\t\tmodel: "oauthRefreshToken",\n\t\twhere: [{\n\t\t\tfield: "token",\n\t\t\tvalue: await getStoredToken(opts.storeTokens, token, "refresh_token")\n\t\t}]\n\t});',
    "TODO(invalidate-family-race)",
    'await deleteIssuedTokens("oauthAccessToken");\n\tawait deleteIssuedTokens("oauthRefreshToken");',
  ])
    expect(source).toContain(fragment);
});

test("native revocation retains token-only reads scoped by user-token-revocation", async () => {
  const files = [
    ...new Bun.Glob("authorize-*.mjs").scanSync(directory.pathname),
  ];
  expect(files).toHaveLength(1);
  const source = await Bun.file(new URL(files[0]!, directory)).text();
  for (const fragment of [
    'const accessToken = await ctx.context.adapter.findOne({\n\t\tmodel: "oauthAccessToken",\n\t\twhere: [{\n\t\t\tfield: "token",\n\t\t\tvalue: await getStoredToken(opts.storeTokens, tokenValue, "access_token")\n\t\t}]\n\t});',
    'const refreshToken = await ctx.context.adapter.findOne({\n\t\tmodel: "oauthRefreshToken",\n\t\twhere: [{\n\t\t\tfield: "token",\n\t\t\tvalue: await getStoredToken(opts.storeTokens, token, "refresh_token")\n\t\t}]\n\t});',
  ])
    expect(source).toContain(fragment);
});
