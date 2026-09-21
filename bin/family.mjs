#!/usr/bin/env node
// Family developer CLI — plain-node arg router (no arg-parsing deps).

import { initCommand } from "../src/commands/init.mjs";
import { devCommand } from "../src/commands/dev.mjs";
import { buildCommand } from "../src/commands/build.mjs";
import { publishCommand } from "../src/commands/publish.mjs";
import { deployCommand } from "../src/commands/deploy.mjs";

const HELP = `Family developer CLI

Usage
  family <command> [options]

Commands
  init app <name>      Scaffold a new Family app
  init module <name>   Scaffold a new Family module
  dev [--port N] [--app <url-or-dir>]
                       Run your app inside the mock Family host (default port 4729)
  build                Bundle the app into a self-contained dist/index.html
  publish              How publishing works (via the Family developer UI)
  deploy               How bundle hosting works (any static https host)
  help                 Show this help

Examples
  family init app my-app
  cd my-app && family dev
  family build
`;

function printHelp() {
  console.log(HELP);
}

const [command, ...rest] = process.argv.slice(2);

switch (command) {
  case undefined:
  case "help":
  case "--help":
  case "-h":
    printHelp();
    break;
  case "init":
    await initCommand(rest);
    break;
  case "dev":
    await devCommand(rest);
    break;
  case "build":
    await buildCommand(rest);
    break;
  case "publish":
    publishCommand(rest);
    break;
  case "deploy":
    deployCommand(rest);
    break;
  default:
    console.error(`Unknown command: ${command}\n`);
    printHelp();
    process.exitCode = 1;
}
