import { execFileSync } from "node:child_process";

const run = (...args) => execFileSync("git", args, { encoding: "utf8" }).trim();
const tags = run("tag", "--list", "v[0-9]*")
  .split("\n")
  .filter((tag) => /^v\d+\.\d+\.\d+$/.test(tag));

function versionParts(tag) {
  return tag.slice(1).split(".").map(Number);
}

tags.sort((a, b) => {
  const left = versionParts(a);
  const right = versionParts(b);
  for (let i = 0; i < 3; i += 1) {
    if (left[i] !== right[i]) return right[i] - left[i];
  }
  return 0;
});

const previousTag = tags[0];
const range = previousTag ? `${previousTag}..HEAD` : "HEAD";
const messages = run("log", range, "--format=%s%n%b%x00")
  .split("\0")
  .filter(Boolean);
const rank = { patch: 0, minor: 1, major: 2 };
const semverType = messages.reduce((release, message) => {
  const subject = message.split("\n", 1)[0];
  const breaking = /^\w+(?:\([^)]*\))?!:/.test(subject) ||
    /^BREAKING CHANGE:/m.test(message);
  const candidate = breaking ? "major" : /^feat(?:\([^)]*\))?:/.test(subject) ? "minor" : "patch";
  return rank[candidate] > rank[release] ? candidate : release;
}, "patch");

const current = previousTag ? versionParts(previousTag) : [0, 0, 0];
if (semverType === "major") {
  current[0] += 1;
  current[1] = 0;
  current[2] = 0;
} else if (semverType === "minor") {
  current[1] += 1;
  current[2] = 0;
} else {
  current[2] += 1;
}

console.log(current.join("."));
