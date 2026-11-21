import * as https from "https";

interface GitHubRelease {
  tag_name?: string;
  draft?: boolean;
  prerelease?: boolean;
}

function versionParts(value: string): number[] | undefined {
  const match = value.trim().replace(/^v/i, "").match(/^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/);
  return match ? match.slice(1, 4).map(Number) : undefined;
}

export function isNewerVersion(latest: string, current: string): boolean {
  const a = versionParts(latest);
  const b = versionParts(current);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] > b[i];
  }
  return false;
}

export function latestGitHubRelease(owner: string, repo: string): Promise<string | undefined> {
  return new Promise((resolve) => {
    const request = https.get(
      `https://api.github.com/repos/${owner}/${repo}/releases/latest`,
      { headers: { "User-Agent": "Snovalang-editor-update-check", Accept: "application/vnd.github+json" }, timeout: 5000 },
      (response) => {
        let body = "";
        response.setEncoding("utf8");
        response.on("data", (chunk: string) => (body += chunk));
        response.on("end", () => {
          try {
            if (response.statusCode !== 200) return resolve(undefined);
            const release = JSON.parse(body) as GitHubRelease;
            if (release.draft || release.prerelease || !release.tag_name) return resolve(undefined);
            resolve(release.tag_name);
          } catch {
            resolve(undefined);
          }
        });
      },
    );
    request.on("timeout", () => request.destroy());
    request.on("error", () => resolve(undefined));
  });
}
