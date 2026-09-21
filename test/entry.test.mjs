import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { MODULE_SCRIPT_RE, resolveEntryHtml } from "../src/lib/entry.mjs";

describe("MODULE_SCRIPT_RE", () => {
  it("matches a module script tag and captures the src", () => {
    const html = `<html><head><script type="module" src="./index.ts"></script></head></html>`;
    const m = html.match(MODULE_SCRIPT_RE);
    expect(m).not.toBeNull();
    expect(m[1]).toBe("./index.ts");
  });

  it("is attribute-order independent", () => {
    const html = `<script src="./main.ts" type="module"></script>`;
    const m = html.match(MODULE_SCRIPT_RE);
    expect(m[1]).toBe("./main.ts");
  });

  it("does not match non-module scripts", () => {
    expect(`<script src="./a.js"></script>`.match(MODULE_SCRIPT_RE)).toBeNull();
    expect(`<script type="text/javascript" src="./a.js"></script>`.match(MODULE_SCRIPT_RE)).toBeNull();
  });
});

describe("resolveEntryHtml", () => {
  it("defaults to src/index.html without a config", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "family-cli-test-"));
    try {
      const { rel, htmlPath } = resolveEntryHtml(dir);
      expect(rel).toBe("src/index.html");
      expect(htmlPath).toBe(path.join(dir, "src/index.html"));
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("honors family.config.json app when present", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "family-cli-test-"));
    try {
      fs.writeFileSync(
        path.join(dir, "family.config.json"),
        JSON.stringify({ app: "app/main.html" })
      );
      const { rel, htmlPath } = resolveEntryHtml(dir);
      expect(rel).toBe("app/main.html");
      expect(htmlPath).toBe(path.join(dir, "app/main.html"));
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("falls back to the default when the config is malformed", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "family-cli-test-"));
    try {
      fs.writeFileSync(path.join(dir, "family.config.json"), "{ not json");
      expect(resolveEntryHtml(dir).rel).toBe("src/index.html");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
