// family init app|module <name> — scaffold a new Family app or module.

import fs from "node:fs";
import path from "node:path";

function toId(name) {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return (slug || "unnamed") + ".v1";
}

function toPkgName(name) {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9-_]+/g, "-")
      .replace(/^-+|-+$/g, "") || "family-app"
  );
}

function manifestFor(kind, name) {
  const base = {
    kind,
    id: toId(name),
    name,
    version: "0.1.0",
    description: "",
    permissions: [],
    entryUrl: "",
  };
  if (kind === "app") {
    return {
      ...base,
      permissions: ["user:identity"],
      familySlug: "",
      shareBps: 1000,
      pricing: { type: "free" },
      custody: "non-custodial",
    };
  }
  return {
    ...base,
    permissions: ["house:read"],
    surfaces: ["house"],
  };
}

function packageJsonFor(name) {
  return {
    name: toPkgName(name),
    private: true,
    version: "0.1.0",
    type: "module",
    scripts: {
      dev: "family dev",
      build: "family build",
    },
    dependencies: {
      "@familydotfun/sdk": "^0.1.0",
    },
    devDependencies: {
      esbuild: "^0.28.0",
      typescript: "^5.6.0",
    },
  };
}

function indexHtmlFor(name) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${name}</title>
  </head>
  <body>
    <div id="hello">Hello from ${name} — loading the Family SDK…</div>
    <script type="module" src="./index.ts"></script>
  </body>
</html>
`;
}

function indexTsFor(kind) {
  const chargeExample =
    kind === "app"
      ? `
    // Example: charge the user (requires the "payments:charge" scope — check it
    // in the dev host control bar and add it to family.manifest.json):
    // const charge = await sdk.payments.charge({
    //   amount: "5",
    //   currency: "USDG",
    //   item: "Premium feature",
    //   idempotencyKey: crypto.randomUUID(),
    // });
    // console.log("charge result:", charge);
`
      : "";
  return `import { createFamilySDK } from "@familydotfun/sdk";

const sdk = createFamilySDK();

async function main() {
  try {
    const ctx = await sdk.getContext();
    document.body.innerHTML += \`<p>Hello from \${ctx.mode} mode — \${"wallet" in ctx ? ctx.wallet : ctx.familySlug}</p>\`;
${chargeExample}  } catch (err) {
    console.error("Family app failed:", err);
    document.body.innerHTML += \`<p style="color: red">Error: \${String(err)}</p>\`;
  }
}

void main();
`;
}

export function initCommand(args) {
  const [kind, name, ...extra] = args;
  if ((kind !== "app" && kind !== "module") || !name || extra.length > 0) {
    console.error("Usage: family init <app|module> <name>");
    process.exitCode = 1;
    return;
  }

  const dir = path.resolve(process.cwd(), name);
  if (fs.existsSync(dir)) {
    console.error(`Refusing to overwrite existing directory: ${dir}`);
    process.exitCode = 1;
    return;
  }

  fs.mkdirSync(path.join(dir, "src"), { recursive: true });
  fs.writeFileSync(
    path.join(dir, "family.manifest.json"),
    JSON.stringify(manifestFor(kind, name), null, 2) + "\n"
  );
  fs.writeFileSync(
    path.join(dir, "package.json"),
    JSON.stringify(packageJsonFor(name), null, 2) + "\n"
  );
  fs.writeFileSync(path.join(dir, "src", "index.html"), indexHtmlFor(name));
  fs.writeFileSync(path.join(dir, "src", "index.ts"), indexTsFor(kind));
  fs.writeFileSync(
    path.join(dir, "family.config.json"),
    JSON.stringify({ app: "src/index.html" }, null, 2) + "\n"
  );

  console.log(`Scaffolded Family ${kind} "${name}" in ${dir}`);
  console.log(`Next:  cd ${name} && npm install && family dev`);
}
