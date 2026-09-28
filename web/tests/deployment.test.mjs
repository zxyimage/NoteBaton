import test from "node:test";
import assert from "node:assert/strict";
import { deploymentArgs } from "../scripts/deployment-options.mjs";
test("fresh clones use the public config; explicit targets override the local deployment", () => {
  assert.deepEqual(deploymentArgs(["--dry-run"]), ["--dry-run"]);
  assert.deepEqual(deploymentArgs(["--dry-run"], "maintainer-instance"), [
    "--name",
    "maintainer-instance",
    "--dry-run",
  ]);
  for (const args of [
    ["--name", "other"],
    ["--name=other"],
    ["--env", "staging"],
    ["-e", "staging"],
    ["--config=other.jsonc"],
    ["-c", "other.jsonc"],
  ])
    assert.deepEqual(deploymentArgs(args, "maintainer-instance"), args);
  assert.throws(() => deploymentArgs([], "bad/name"));
});

test("local custom domains stay with their Worker and never leak into explicit deployment targets", () => {
  assert.deepEqual(deploymentArgs([], "notebaton", "notebaton.org"), [
    "--name",
    "notebaton",
    "--domains",
    "notebaton.org",
  ]);
  assert.deepEqual(
    deploymentArgs(["--name", "another"], "notebaton", "notebaton.org"),
    ["--name", "another"],
  );
  assert.deepEqual(
    deploymentArgs(
      ["--domains", "other.example"],
      "notebaton",
      "notebaton.org",
    ),
    ["--name", "notebaton", "--domains", "other.example"],
  );
  assert.throws(() =>
    deploymentArgs([], "notebaton", "https://notebaton.org/path"),
  );
  assert.throws(() => deploymentArgs([], undefined, "notebaton.org"));
});

test("site and self-hosted deployments use separate configuration and local targets", async () => {
  const { distributionOptions } = await import("../scripts/deployment-options.mjs");
  assert.deepEqual(distributionOptions(["--dry-run", "--name", "my-notes"]), {
    site: false, args: ["--dry-run", "--name", "my-notes"],
    config: "wrangler.jsonc", localFile: ".deploy.local.json",
  });
  assert.deepEqual(distributionOptions(["--site", "--dry-run"]), {
    site: true, args: ["--dry-run"],
    config: "wrangler.site.jsonc", localFile: ".deploy.site.local.json",
  });
});
