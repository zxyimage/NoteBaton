// Legacy secrets are optional for fresh v2 deployments. Keep this separate from
// Wrangler's generated bindings so type generation does not require old secrets.
export type LegacyEnvironment = Env & {
  LOGIN_USERNAME?: string;
  LOGIN_PASSWORD_HASH?: string;
};
