import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname } from "node:path";

export type RepoConfig = {
  ghPath: string;
  owner: string;
  name: string;
  branch?: string;
};

export type GhErrorKind = "missing" | "unauthenticated" | "other";

export class GhError extends Error {
  constructor(
    message: string,
    readonly kind: GhErrorKind = "other",
  ) {
    super(message);
  }
}

const GH_CANDIDATES = ["/opt/homebrew/bin/gh", "/usr/local/bin/gh", "/usr/bin/gh"];

export function findGh(preferred?: string, candidates: string[] = GH_CANDIDATES): string | undefined {
  return (preferred ? [preferred, ...candidates] : candidates).find((path) => existsSync(path));
}

export function repoSlug(config: Pick<RepoConfig, "owner" | "name">): string {
  return `${config.owner}/${config.name}`;
}

export function parseRepository(value: string): { owner: string; name: string } {
  const slug = value
    .trim()
    .replace(/^https?:\/\/github\.com\//, "")
    .replace(/\.git$/, "")
    .replace(/\/+$/, "");
  const [owner, name, ...rest] = slug.split("/");
  if (!owner || !name || rest.length > 0) {
    throw new GhError(`Repository must look like owner/name, got "${value}"`);
  }
  return { owner, name };
}

const MAX_OUTPUT_BYTES = 256 * 1024 * 1024;
const NOT_SIGNED_IN = /gh auth login|not logged in|authentication required/i;

export function gh(config: Pick<RepoConfig, "ghPath">, args: string[]): Promise<string> {
  const path = [dirname(config.ghPath), "/opt/homebrew/bin", "/usr/local/bin", "/usr/bin", "/bin"].join(":");
  return new Promise((resolve, reject) => {
    execFile(
      config.ghPath,
      args,
      {
        maxBuffer: MAX_OUTPUT_BYTES,
        env: { ...process.env, PATH: path, GH_PROMPT_DISABLED: "1", GH_NO_UPDATE_NOTIFIER: "1", NO_COLOR: "1" },
      },
      (error, stdout, stderr) => {
        if (!error) {
          resolve(stdout);
          return;
        }
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
          reject(new GhError(`GitHub CLI not found at ${config.ghPath}`, "missing"));
          return;
        }
        const message = stderr.trim().replace(/^gh: /, "") || error.message;
        if (/Could not resolve to a Repository/.test(message)) {
          reject(new GhError(`${message} Check the name, and that the account gh is signed in to can see it.`));
          return;
        }
        if (NOT_SIGNED_IN.test(message)) {
          reject(new GhError("The GitHub CLI isn't signed in. Run gh auth login in a terminal.", "unauthenticated"));
          return;
        }
        reject(new GhError(message.length > 400 ? `${message.slice(0, 400)}…` : message));
      },
    );
  });
}

export async function graphql<T>(
  config: Pick<RepoConfig, "ghPath">,
  query: string,
  variables: Record<string, string | number | undefined>,
): Promise<T> {
  const args = ["api", "graphql", "-f", `query=${query}`];
  for (const [key, value] of Object.entries(variables)) {
    if (value !== undefined) {
      args.push(typeof value === "number" ? "-F" : "-f", `${key}=${value}`);
    }
  }
  const response = JSON.parse(await gh(config, args)) as { data?: T; errors?: { message: string }[] };
  if (response.errors?.length) {
    throw new GhError(response.errors.map((error) => error.message).join("; "));
  }
  if (!response.data) {
    throw new GhError("GitHub returned no data");
  }
  return response.data;
}

export async function rest<T>(config: Pick<RepoConfig, "ghPath">, path: string): Promise<T> {
  return JSON.parse(await gh(config, ["api", path])) as T;
}

export function setupCommand(error: unknown): string | undefined {
  if (!(error instanceof GhError)) {
    return undefined;
  }
  if (error.kind === "missing") {
    return "brew install gh && gh auth login";
  }
  return error.kind === "unauthenticated" ? "gh auth login" : undefined;
}
