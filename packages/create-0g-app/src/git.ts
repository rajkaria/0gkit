import { execa } from "execa";

export interface InitGitResult {
  ok: boolean;
  reason?: string;
}

/**
 * Initialise a fresh git repo in `dest` with a single "bootstrap" commit.
 *
 * Never throws — if git is missing, returns `{ ok: false, reason }` so the
 * scaffolder can degrade gracefully and just warn the user.
 *
 * The commit uses an inline author identity (`-c user.email=... -c user.name=...`)
 * so we never write to the user's global git config and never fail on machines
 * that haven't run `git config --global user.email`.
 */
export async function initGitRepo(opts: {
  dest: string;
  gitBin?: string;
}): Promise<InitGitResult> {
  const git = opts.gitBin ?? "git";
  try {
    await execa(git, ["init", "--initial-branch=main"], { cwd: opts.dest });
    await execa(git, ["add", "."], { cwd: opts.dest });
    await execa(
      git,
      [
        "-c",
        "user.email=hello@0gkit.com",
        "-c",
        "user.name=create-0g-app",
        "commit",
        "-m",
        "chore: bootstrap from create-0g-app",
      ],
      { cwd: opts.dest }
    );
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: (e as Error).message };
  }
}
