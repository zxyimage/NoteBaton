import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { deploymentArgs, distributionOptions } from "./deployment-options.mjs";

const { site, args: input, config, localFile } = distributionOptions(process.argv.slice(2));
let local = {};
try {
  local = JSON.parse(readFileSync(new URL(`../${localFile}`, import.meta.url), "utf8"));
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
let args = deploymentArgs(input, local.name, local.domain);
if (!input.some(value => value === "--config" || value === "-c" || value.startsWith("--config=")))
  args = ["--config", config, ...args];
function run(command, argv) {
  const result = spawnSync(command, argv, {
    stdio: "inherit",
    cwd: new URL("../", import.meta.url),
    env: { ...process.env, CI: "true" },
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
run("npm", ["run", site ? "build:site" : "build"]);
if (site) run("npm", ["run", "check:legal:release"]);
run("npx", ["wrangler", "deploy", ...args]);
