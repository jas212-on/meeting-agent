import path from "node:path";

export interface Config {
  meetUrl: string;
  displayName?: string;
  profileDir: string;
  prejoinTimeoutMs: number;
  admissionTimeoutMs: number;

  svclPath: string;
  cableInputName: string;
  cableOutputName: string;

  vapiKey?: string;
  assistantId?: string;
  noVapi: boolean;
  bridgePort: number;
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
  const svclPath =
    getValue("--svcl") ?? process.env.SVCL_PATH ?? path.resolve("tools", "svcl.exe");
  const vapiKey = process.env.VAPI_PRIVATE_KEY || undefined;
  const assistantId = process.env.VAPI_ASSISTANT_ID || undefined;
  const noVapi = args.includes("--no-vapi") || process.env.NO_VAPI === "1";

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

    svclPath,
    cableInputName:
      process.env.CABLE_INPUT_NAME ?? "CABLE Input (VB-Audio Virtual Cable)",
    cableOutputName:
      process.env.CABLE_OUTPUT_NAME ?? "CABLE Output (VB-Audio Virtual Cable)",

    vapiKey,
    assistantId,
    noVapi,
    bridgePort: Number(process.env.BRIDGE_PORT ?? 4711),
  };
}

function appendLanguageParam(url: string): string {
  const u = new URL(url);
  u.searchParams.set("hl", "en");
  return u.toString();
}