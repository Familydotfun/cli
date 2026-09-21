// family deploy — deployment is plain static hosting; nothing is uploaded here.

export function deployCommand() {
  console.log(`
family deploy is intentionally a no-op: deployment is just static hosting.

  1. family build            → dist/index.html (one self-contained file)
  2. Upload dist/ to any     https static host and note the URL
  3. Put that URL in         family.manifest.json → entryUrl
  4. Register / update the   app in the Family developer UI (family publish)

Because the bundle is inlined, hosting is trivial: one file, any static server.
`);
}
