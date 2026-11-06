import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const [major, minor, patch] = process.argv[2]?.split(".") ?? [];
if (![major, minor, patch].every((part) => /^\d+$/.test(part ?? ""))) {
  throw new Error("Usage: node scripts/set-release-version.mjs MAJOR.MINOR.PATCH");
}
const version = `${major}.${minor}.${patch}`;

function updateJson(relativePath, update) {
  const file = path.join(root, relativePath);
  const json = JSON.parse(fs.readFileSync(file, "utf8"));
  update(json);
  fs.writeFileSync(file, `${JSON.stringify(json, null, 2)}\n`);
}

updateJson("vscode/package.json", (pkg) => { pkg.version = version; });
updateJson("vscode/package-lock.json", (lock) => {
  lock.version = version;
  lock.packages[""].version = version;
});

const extensionToml = path.join(root, "zed/extension.toml");
fs.writeFileSync(extensionToml,
  fs.readFileSync(extensionToml, "utf8").replace(/^version = ".*"$/m, `version = "${version}"`));

const cargoToml = path.join(root, "zed/Cargo.toml");
fs.writeFileSync(cargoToml,
  fs.readFileSync(cargoToml, "utf8").replace(/^(version = ").*(")$/m, `$1${version}$2`));

const cargoLock = path.join(root, "zed/Cargo.lock");
fs.writeFileSync(cargoLock,
  fs.readFileSync(cargoLock, "utf8").replace(
    /(\[\[package\]\]\nname = "zed-snovalang"\nversion = ").*(")/,
    `$1${version}$2`,
  ));

console.log(version);
