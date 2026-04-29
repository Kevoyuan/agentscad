#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const NODE_MODULES = path.join(ROOT, "node_modules");
const SCAD_MANIFEST = path.join(ROOT, "skills/scad-library-policy/manifest.json");

const BLOCKED_LICENSE_RE = /\b(?:AGPL|GPL)(?:[-\s]?\d(?:\.\d)?)?\b|Affero General Public License|GNU General Public License/i;
const WEAK_COPYLEFT_RE = /\bLGPL(?:[-\s]?\d(?:\.\d)?)?\b|Lesser General Public License/i;

const allowedWeakCopyleftPackages = new Set([
  "@img/sharp-libvips-darwin-arm64",
  "@img/sharp-libvips-darwin-x64",
  "@img/sharp-libvips-linux-arm",
  "@img/sharp-libvips-linux-arm64",
  "@img/sharp-libvips-linux-ppc64",
  "@img/sharp-libvips-linux-s390x",
  "@img/sharp-libvips-linux-x64",
  "@img/sharp-libvips-linuxmusl-arm64",
  "@img/sharp-libvips-linuxmusl-x64",
  "@img/sharp-libvips-wasm32",
  "@img/sharp-libvips-win32-arm64",
  "@img/sharp-libvips-win32-ia32",
  "@img/sharp-libvips-win32-x64",
]);

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function packageLicense(pkg) {
  if (typeof pkg.license === "string") {
    return pkg.license;
  }
  if (Array.isArray(pkg.licenses)) {
    return pkg.licenses.map((license) => license.type || license).join(" OR ");
  }
  return "NOASSERTION";
}

function scanNodeModules() {
  if (!fs.existsSync(NODE_MODULES)) {
    return { skipped: true, blocked: [], weakCopyleft: [] };
  }

  const blocked = [];
  const weakCopyleft = [];

  for (const scopeOrPackage of fs.readdirSync(NODE_MODULES, { withFileTypes: true })) {
    if (!scopeOrPackage.isDirectory() || scopeOrPackage.name.startsWith(".")) {
      continue;
    }

    const packageDirs = scopeOrPackage.name.startsWith("@")
      ? fs
          .readdirSync(path.join(NODE_MODULES, scopeOrPackage.name), { withFileTypes: true })
          .filter((entry) => entry.isDirectory())
          .map((entry) => path.join(NODE_MODULES, scopeOrPackage.name, entry.name))
      : [path.join(NODE_MODULES, scopeOrPackage.name)];

    for (const packageDir of packageDirs) {
      const packageJsonPath = path.join(packageDir, "package.json");
      if (!fs.existsSync(packageJsonPath)) {
        continue;
      }

      const pkg = readJson(packageJsonPath);
      const license = packageLicense(pkg);
      const name = pkg.name || path.basename(packageDir);
      const record = {
        name,
        version: pkg.version || "unknown",
        license,
        path: path.relative(ROOT, packageJsonPath),
      };

      if (BLOCKED_LICENSE_RE.test(license) && !WEAK_COPYLEFT_RE.test(license)) {
        blocked.push(record);
      } else if (WEAK_COPYLEFT_RE.test(license)) {
        weakCopyleft.push({
          ...record,
          allowed: allowedWeakCopyleftPackages.has(name),
        });
      }
    }
  }

  return { skipped: false, blocked, weakCopyleft };
}

function scanScadManifest() {
  if (!fs.existsSync(SCAD_MANIFEST)) {
    return { blockedDefaultInstalls: [], weakCopyleftDefaultInstalls: [] };
  }

  const manifest = readJson(SCAD_MANIFEST);
  const libraries = Array.isArray(manifest.libraries) ? manifest.libraries : [];
  const defaultLibraries = libraries.filter((library) => library.default_install === true);

  return {
    blockedDefaultInstalls: defaultLibraries.filter(
      (library) => library.license_gate === "gpl" || BLOCKED_LICENSE_RE.test(library.license || ""),
    ),
    weakCopyleftDefaultInstalls: defaultLibraries.filter(
      (library) => library.license_gate === "weak-copyleft" || WEAK_COPYLEFT_RE.test(library.license || ""),
    ),
  };
}

function printRecords(title, records) {
  if (!records.length) {
    return;
  }
  console.log(`\n${title}`);
  for (const record of records) {
    const status = Object.prototype.hasOwnProperty.call(record, "allowed")
      ? ` (${record.allowed ? "allowed" : "not allowlisted"})`
      : "";
    console.log(`- ${record.name}@${record.version}: ${record.license}${status} [${record.path}]`);
  }
}

function printScadRecords(title, libraries) {
  if (!libraries.length) {
    return;
  }
  console.log(`\n${title}`);
  for (const library of libraries) {
    console.log(`- ${library.name}: ${library.license} (${library.license_gate})`);
  }
}

function main() {
  const npmScan = scanNodeModules();
  const scadScan = scanScadManifest();
  const unapprovedWeakCopyleft = npmScan.weakCopyleft.filter((record) => !record.allowed);

  if (npmScan.skipped) {
    console.log("node_modules not found; skipped installed npm package license scan.");
  }

  printRecords("Blocked npm package licenses", npmScan.blocked);
  printRecords("Weak copyleft npm package licenses", npmScan.weakCopyleft);
  printScadRecords("Blocked default OpenSCAD libraries", scadScan.blockedDefaultInstalls);
  printScadRecords("Weak copyleft default OpenSCAD libraries", scadScan.weakCopyleftDefaultInstalls);

  if (npmScan.blocked.length || unapprovedWeakCopyleft.length || scadScan.blockedDefaultInstalls.length) {
    console.error("\nLicense audit failed.");
    console.error("GPL/AGPL dependencies must not be part of the default dependency tree or default OpenSCAD install.");
    console.error("New LGPL dependencies require review and allowlisting before distribution.");
    process.exit(1);
  }

  console.log("\nLicense audit passed.");
  if (npmScan.weakCopyleft.length || scadScan.weakCopyleftDefaultInstalls.length) {
    console.log("Weak copyleft items are allowed but require preserved notices and distribution compliance.");
  }
}

main();
