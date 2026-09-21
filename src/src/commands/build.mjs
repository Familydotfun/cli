// family build — bundle the html entry into a self-contained dist/index.html.

import fs from "node:fs";
import path from "node:path";
import { build } from "esbuild";
import { MODULE_SCRIPT_RE, resolveEntryHtml } from "../lib/entry.mjs";

export async function buildCommand() {
  const cwd = process.cwd();
  const { rel: entryHtml, htmlPath } = resolveEntryHtml(cwd);

  if (!fs.existsSync(htmlPath)) {
    console.error(
      `Build failed: entry HTML not found: ${entryHtml}\n` +
        "Run this from an app directory (see: family init app <name>)."
    );
    process.exitCode = 1;
    return;
  }

  const html = fs.readFileSync(htmlPath, "utf8");
  const m = html.match(MODULE_SCRIPT_RE);
  if (!m) {
    console.error(
      `Build failed: no <script type="module" src="..."> tag found in ${entryHtml}`
    );
    process.exitCode = 1;
    return;
  }

  const entry = path.resolve(path.dirname(htmlPath), m[1]);
  if (!fs.existsSync(entry)) {
    console.error(`Build failed: script entry not found: ${path.relative(cwd, entry)}`);
    process.exitCode = 1;
    return;
  }

  let code;
  try {
    const result = await build({
      entryPoints: [entry],
      bundle: true,
      write: false,
      format: "esm",
      platform: "browser",
      target: "es2020",
      absWorkingDir: cwd,
      logLevel: "silent",
    });
    code = result.outputFiles[0].text;
  } catch (err) {
    console.error("Build failed:\n" + err.message);
    process.exitCode = 1;
    return;
  }

  // Inline the bundle so dist/index.html is one self-contained file that can
  // be hosted anywhere. Guard against "</script>" appearing inside strings.
  const safe = code.replace(/<\/script/gi, "<\\/script");
  const outHtml = html.replace(
    MODULE_SCRIPT_RE,
    '<script type="module">\n' + safe + "\n</script>"
  );

  const distDir = path.join(cwd, "dist");
  fs.mkdirSync(distDir, { recursive: true });
  const outPath = path.join(distDir, "index.html");
  fs.writeFileSync(outPath, outHtml);

  console.log("Built " + path.relative(cwd, outPath));
  console.log("Self-contained single file — host dist/ on any static https server");
  console.log("and set that URL as entryUrl in family.manifest.json.");
}
