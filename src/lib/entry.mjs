// Shared html-entry resolution used by build.mjs and dev.mjs.

import fs from "node:fs";
import path from "node:path";

// A <script type="module" src="…"> tag (attribute order independent); group 1
// is the src and the whole match can be replaced to inline/rewrite the bundle.
export const MODULE_SCRIPT_RE =
  /<script\b(?=[^>]*\btype=["']module["'])(?=[^>]*\bsrc=["']([^"']+)["'])[^>]*>[\s\S]*?<\/script>/i;

/** Resolve the app entry html for a project dir (family.config.json → src/index.html). */
export function resolveEntryHtml(dir) {
  let rel = "src/index.html";
  const cfgPath = path.join(dir, "family.config.json");
  if (fs.existsSync(cfgPath)) {
    try {
      const cfg = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
      if (typeof cfg.app === "string" && cfg.app) rel = cfg.app;
    } catch {
      /* fall back to the default */
    }
  }
  return { rel, htmlPath: path.join(dir, rel) };
}
