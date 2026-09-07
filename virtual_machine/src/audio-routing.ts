import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface DeviceInfo {
  name: string;
  type: string;
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
    const idx = header.indexOf(name);
    if (idx === -1) throw new Error(`svcl output missing column "${name}"`);
    return idx;
  };
  const nameCol = col("name");
  const typeCol = col("type");
  const idCol = col("command-line friendly id");
  const defaultCol = col("default");

  const devices: DeviceInfo[] = [];
  for (let r = 1; r < rows.length; r++) {
    const cells = parseCsvLine(rows[r]);
    const type = (cells[typeCol] ?? "").trim();
    if (!/device/i.test(type)) continue;
    devices.push({
      name: cells[nameCol],
      type,
      friendlyId: cells[idCol],
      defaults: (cells[defaultCol] ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    });
  }
  return devices;
}

export async function listDevices(svclPath: string): Promise<DeviceInfo[]> {
  const out = await runSvc(svclPath, ["/scomma"]);
  return parseScomma(out);
}

export async function findCableDevices(
  svclPath: string,
  inputName: string,
  outputName: string,
): Promise<{ inputId: string; outputId: string }> {
  const devices = await listDevices(svclPath);
  const input = devices.find((d) => d.friendlyId.includes(inputName));
  const output = devices.find((d) => d.friendlyId.includes(outputName));
  if (!input || !output) {
    throw new Error(
      `VB-Cable not found. Expected "${inputName}" and "${outputName}". ` +
        "Install VB-Cable, reboot, and verify devices in Windows Sound settings.",
    );
  }
  return { inputId: input.friendlyId, outputId: output.friendlyId };
}

export async function getCurrentDefaults(
  svclPath: string,
): Promise<DefaultsState> {
  const devices = await listDevices(svclPath);
  const render = devices.find((d) =>
    d.defaults.includes("Default Render (Multimedia)"),
  );
  const capture = devices.find((d) =>
    d.defaults.includes("Default Capture (Multimedia)"),
  );
  if (!render || !capture) {
    throw new Error(
      "Could not determine current default audio devices. Check that speakers and a microphone exist.",
    );
  }
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
  await setDefaultDevice(svclPath, state.render);
  await setDefaultDevice(svclPath, state.capture);
}

export async function setSystemDefaultsForMeeting(
  svclPath: string,
  inputName: string,
  outputName: string,
): Promise<DefaultsState> {
  const previous = await getCurrentDefaults(svclPath);
  const { inputId, outputId } = await findCableDevices(
    svclPath,
    inputName,
    outputName,
  );
  await setDefaultDevice(svclPath, inputId);
  await setDefaultDevice(svclPath, outputId);
  return previous;
}