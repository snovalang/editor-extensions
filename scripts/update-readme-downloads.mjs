// Adds a release to the downloads table in README.md, between the
// <!-- downloads:start --> and <!-- downloads:end --> markers. The newest
// version is the first row; older rows stay as links to their own assets.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO = "snovalang/editor-extensions";
const KEEP = 10;
const ASSETS = [
  ["VS Code", "snovalang.vsix"],
  ["Zed", "snovalang-zed.tar.gz"],
  ["JetBrains", "snovalang-jetbrains.zip"],
];

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const version = process.argv[2];
if (!/^\d+\.\d+\.\d+$/.test(version ?? "")) {
  throw new Error("Usage: node scripts/update-readme-downloads.mjs MAJOR.MINOR.PATCH");
}
const date = process.argv[3] ?? new Date().toISOString().slice(0, 10);

const readmePath = path.join(root, "README.md");
const readme = fs.readFileSync(readmePath, "utf8");
const start = "<!-- downloads:start -->";
const end = "<!-- downloads:end -->";
const from = readme.indexOf(start);
const to = readme.indexOf(end);
if (from < 0 || to < from) throw new Error("README.md is missing the downloads markers");

const rowFor = (v, d) => {
  const base = `https://github.com/${REPO}/releases/download/v${v}`;
  const links = ASSETS.map(([label, file]) => `[${label}](${base}/${file})`);
  return `| [v${v}](https://github.com/${REPO}/releases/tag/v${v}) | ${d} | ${links.join(" | ")} |`;
};

const previous = readme
  .slice(from, to)
  .split("\n")
  .filter((line) => /^\| \[v\d+\.\d+\.\d+\]/.test(line))
  .filter((line) => !line.startsWith(`| [v${version}]`));
const rows = [rowFor(version, date), ...previous].slice(0, KEEP);

const latest = ASSETS.map(
  ([label, file]) => `[**${label}**](https://github.com/${REPO}/releases/latest/download/${file})`,
).join(" · ");

const block = [
  start,
  `**Latest: v${version}** — ${latest}`,
  "",
  `| Version | Date | ${ASSETS.map(([label]) => label).join(" | ")} |`,
  `| --- | --- | ${ASSETS.map(() => "---").join(" | ")} |`,
  ...rows,
  "",
  `Older versions: [all releases](https://github.com/${REPO}/releases).`,
  end,
].join("\n");

fs.writeFileSync(readmePath, readme.slice(0, from) + block + readme.slice(to + end.length));
console.log(`README.md lists v${version}`);
