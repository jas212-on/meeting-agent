export interface Config {
  meetUrl: string;
  displayName?: string;
  profileDir: string;
  prejoinTimeoutMs: number;
  admissionTimeoutMs: number;
}

const MEET_URL_RE = /^https:\/\/meet\.google\.com\/[\w-]+(\/|\?|#|$)/i;

export function parseConfig(argv: string[]): Config {
  const args = argv.slice(2);
  const getValue = (flag: string): string | undefined => {
    const idx = args.indexOf(flag);
    if (idx === -1) return undefined;
    return args[idx + 1];
  };
  const positionalUrl = args.find((a) => !a.startsWith("-"));

  const meetUrl =
    getValue("--url") ?? getValue("-u") ?? positionalUrl ?? process.env.MEET_URL;
  const displayName =
    getValue("--name") ?? process.env.DISPLAY_NAME ?? undefined;
  const profileDir =
    getValue("--profile") ?? process.env.PROFILE_DIR ?? "profiles/meet";

  if (!meetUrl) {
    throw new Error(
      "Missing Meet URL. Pass --url <meet-link> or set the MEET_URL env var.",
    );
  }
  if (!MEET_URL_RE.test(meetUrl)) {
    throw new Error(
      `Invalid Meet URL: "${meetUrl}". Expected something like https://meet.google.com/abc-defg-hij`,
    );
  }

  return {
    meetUrl: appendLanguageParam(meetUrl),
    displayName,
    profileDir,
    prejoinTimeoutMs: 60_000,
    admissionTimeoutMs: 90_000,
  };
}

function appendLanguageParam(url: string): string {
  const u = new URL(url);
  u.searchParams.set("hl", "en");
  return u.toString();
}