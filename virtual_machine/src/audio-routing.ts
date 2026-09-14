import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface DeviceInfo {
  name: string;
  type: string;
  direction?: string;
  friendlyId: string;
  defaults: string[];
}

export interface DefaultsState {
  render: string;
  capture: string;
}

async function runSvc(svclPath: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync(svclPath, args, {
    windowsHide: true,
    maxBuffer: 16 * 1024 * 1024,
  });
  return stdout;
}

function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      cells.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  cells.push(current);
  return cells;
}

function parseScomma(output: string): DeviceInfo[] {
  const rows = output.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const header = parseCsvLine(rows[0]).map((h) => h.trim().toLowerCase());
  const col = (name: string): number => {
    return header.indexOf(name);
  };
  const nameCol = col("name");
  const typeCol = col("type");
  const dirCol = col("direction");
  const idCol = col("command-line friendly id");

  if (nameCol === -1 || typeCol === -1 || idCol === -1) {
    throw new Error("svcl output missing expected device columns");
  }

  const defaultCols = ["default", "default multimedia", "default communications"]
    .map((name) => header.indexOf(name))
    .filter((idx) => idx !== -1);

  const devices: DeviceInfo[] = [];
  for (let r = 1; r < rows.length; r++) {
    const cells = parseCsvLine(rows[r]);
    const type = (cells[typeCol] ?? "").trim();
    if (!/device/i.test(type)) continue;

    const defaults = defaultCols
      .flatMap((idx) => (cells[idx] ?? "").split(","))
      .map((s) => s.trim())
      .filter(Boolean);

    devices.push({
      name: cells[nameCol],
      type,
      direction: dirCol !== -1 ? cells[dirCol]?.trim() : undefined,
      friendlyId: cells[idCol],
      defaults,
    });
  }
  return devices;
}

export async function listDevices(svclPath: string): Promise<DeviceInfo[]> {
  const out = await runSvc(svclPath, ["/scomma"]);
  return parseScomma(out);
}

function matchDevice(
  devices: DeviceInfo[],
  pattern: string,
  expectedDirection: "Render" | "Capture",
): DeviceInfo | undefined {
  const cleanPattern = pattern.toLowerCase();
  return (
    devices.find(
      (d) =>
        d.direction?.toLowerCase() === expectedDirection.toLowerCase() &&
        (d.friendlyId.toLowerCase().includes(cleanPattern) ||
          d.name.toLowerCase().includes(cleanPattern)),
    ) ??
    devices.find(
      (d) =>
        d.friendlyId.toLowerCase().includes(cleanPattern) ||
        d.name.toLowerCase().includes(cleanPattern),
    ) ??
    devices.find(
      (d) =>
        d.direction?.toLowerCase() === expectedDirection.toLowerCase() &&
        (d.friendlyId.toLowerCase().includes("cable") ||
          d.name.toLowerCase().includes("cable")),
    )
  );
}

export async function findCableDevices(
  svclPath: string,
  inputName: string,
  outputName: string,
): Promise<{ inputId: string; outputId: string }> {
  console.log(`[AudioRouting] Step: Scanning audio devices with SoundVolumeView for "${inputName}" and "${outputName}"...`);
  const devices = await listDevices(svclPath);
  const input = matchDevice(devices, inputName, "Render");
  const output = matchDevice(devices, outputName, "Capture");
  if (!input || !output) {
    console.error(
      `[AudioRouting] FAILED: VB-Cable devices not found. Render match: ${input?.friendlyId ?? "NOT FOUND"}, Capture match: ${output?.friendlyId ?? "NOT FOUND"}`,
    );
    throw new Error(
      `VB-Cable not found. Expected "${inputName}" and "${outputName}". ` +
        "Install VB-Cable, reboot, and verify devices in Windows Sound settings.",
    );
  }
  console.log(`[AudioRouting] SUCCESS: Found VB-Cable Input (Render: "${input.friendlyId}") and Output (Capture: "${output.friendlyId}")`);
  return { inputId: input.friendlyId, outputId: output.friendlyId };
}

export async function getCurrentDefaults(
  svclPath: string,
): Promise<DefaultsState> {
  console.log("[AudioRouting] Step: Querying current Windows default audio devices...");
  const devices = await listDevices(svclPath);
  const render =
    devices.find(
      (d) =>
        d.direction?.toLowerCase() === "render" &&
        d.defaults.some((def) => /render/i.test(def)),
    ) ?? devices.find((d) => d.defaults.some((def) => /render/i.test(def)));

  const capture =
    devices.find(
      (d) =>
        d.direction?.toLowerCase() === "capture" &&
        d.defaults.some((def) => /capture/i.test(def)),
    ) ?? devices.find((d) => d.defaults.some((def) => /capture/i.test(def)));

  if (!render || !capture) {
    console.error("[AudioRouting] FAILED: Could not determine current default render/capture devices");
    throw new Error(
      "Could not determine current default audio devices. Check that speakers and a microphone exist.",
    );
  }
  console.log(`[AudioRouting] Current Windows defaults -> Render: "${render.friendlyId}", Capture: "${capture.friendlyId}"`);
  return { render: render.friendlyId, capture: capture.friendlyId };
}

export async function setDefaultDevice(
  svclPath: string,
  friendlyId: string,
): Promise<void> {
  await runSvc(svclPath, ["/SetDefault", friendlyId, "all"]);
}

export async function restoreDefaults(
  svclPath: string,
  state: DefaultsState,
): Promise<void> {
  console.log(`[AudioRouting] Step: Restoring previous Windows audio defaults (Render: "${state.render}", Capture: "${state.capture}")...`);
  if (state.render) await setDefaultDevice(svclPath, state.render);
  if (state.capture) await setDefaultDevice(svclPath, state.capture);
  console.log("[AudioRouting] SUCCESS: Previous Windows audio defaults restored.");
}

export async function setDeviceVolume(
  svclPath: string,
  friendlyId: string,
  percent: number,
): Promise<void> {
  await runSvc(svclPath, ["/Unmute", friendlyId]);
  await runSvc(svclPath, ["/SetVolume", friendlyId, percent.toString()]);
}

export async function setSystemDefaultsForMeeting(
  svclPath: string,
  inputName: string,
  outputName: string,
): Promise<DefaultsState> {
  console.log("[AudioRouting] Step: Setting system audio defaults to VB-Cable for meeting...");
  const previous = await getCurrentDefaults(svclPath);
  const { inputId, outputId } = await findCableDevices(
    svclPath,
    inputName,
    outputName,
  );
  console.log(`[AudioRouting] Setting default playback device to: "${inputId}" and recording to: "${outputId}"...`);
  await setDefaultDevice(svclPath, inputId);
  await setDefaultDevice(svclPath, outputId);
  await setDeviceVolume(svclPath, inputId, 100);
  await setDeviceVolume(svclPath, outputId, 100);
  console.log("[AudioRouting] SUCCESS: VB-Cable audio routing configured and unmuted at 100% volume.");
  return previous;
}