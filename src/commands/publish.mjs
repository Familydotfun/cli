// family publish — publishing happens in the Family developer UI; no CLI upload.

export function publishCommand() {
  console.log(`
Publishing goes through the Family developer UI — the CLI does not upload anything.

  1. Build your bundle:    family build
                           → dist/index.html (fully self-contained)
  2. Host dist/ on any     static https host (Vercel, Netlify, IPFS, S3, …)
  3. Set the hosted URL    as entryUrl in family.manifest.json
  4. Open the Family       developer UI → Create app → paste your manifest
  5. The family head       approves the requested permissions → your app goes live

Tips
  - Keep family.manifest.json permissions in sync with what you call at runtime.
  - Bump the manifest version whenever you ship a new bundle.
`);
}
