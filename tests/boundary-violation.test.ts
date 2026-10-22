import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

describe("Hexagonal Boundary Enforcement", () => {
  it("passes boundary checks for valid architecture codebase", () => {
    const result = spawnSync(
      "bun",
      ["x", "depcruise", "--config", ".dependency-cruiser.js", "packages", "apps"],
      {
        encoding: "utf8",
      },
    );

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("no dependency violations found");
  });

  it("fails and detects violations on negative boundary fixtures", () => {
    const result = spawnSync(
      "bun",
      ["x", "depcruise", "--config", ".dependency-cruiser.js", "tests/fixtures/boundary-violation"],
      {
        encoding: "utf8",
      },
    );

    expect(result.status).not.toBe(0);
    const combinedOutput = `${result.stdout}\n${result.stderr}`;
    expect(combinedOutput).toContain("error worker-no-web");
    expect(combinedOutput).toContain("error domain-purity-no-other-layers");
    expect(combinedOutput).toContain("error domain-purity-no-external-io");
  });
});
