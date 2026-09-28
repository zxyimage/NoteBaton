// An explicit target always wins over the maintainer's ignored local default.
export function deploymentArgs(args, localName, localDomain) {
  const explicitTarget = args.some(
    (value) =>
      ["--name", "--config", "-c", "--env", "-e"].includes(value) ||
      /^(--name|--config|--env)=/.test(value),
  );
  if (explicitTarget) return args;
  if (localName === undefined) {
    if (localDomain !== undefined)
      throw new Error("A local domain requires a local Worker name");
    return args;
  }
  if (
    typeof localName !== "string" ||
    !/^[a-z0-9][a-z0-9-]{0,62}$/.test(localName)
  )
    throw new Error(".deploy.local.json must contain a valid Worker name");
  const result = ["--name", localName, ...args];
  const explicitDomains = args.some(
    (value) => value === "--domains" || value.startsWith("--domains="),
  );
  if (localDomain === undefined || explicitDomains) return result;
  if (
    typeof localDomain !== "string" ||
    localDomain.length > 253 ||
    !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(
      localDomain,
    )
  )
    throw new Error(
      ".deploy.local.json must contain a hostname without a scheme or path",
    );
  return [...result, "--domains", localDomain];
}

export function distributionOptions(args) {
  const site = args.includes("--site");
  return {
    site,
    args: args.filter(value => value !== "--site"),
    config: site ? "wrangler.site.jsonc" : "wrangler.jsonc",
    localFile: site ? ".deploy.site.local.json" : ".deploy.local.json",
  };
}
