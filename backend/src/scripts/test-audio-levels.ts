import fs from "node:fs";
import path from "node:path";

const files = [
  "oyv-gstt-ooj-audio.raw",
  "nga-qefg-oqk-audio.raw"
];

for (const name of files) {
  const p = path.resolve(process.cwd(), "..", "virtual_machine", "recordings", name);
  if (!fs.existsSync(p)) {
    console.log(name, "not found");
    continue;
  }
  const buf = fs.readFileSync(p);
  let max = 0;
  let nonZero = 0;
  for (let i = 0; i < buf.length; i += 2) {
    const val = Math.abs(buf.readInt16LE(i));
    if (val > 0) nonZero++;
    if (val > max) max = val;
  }
  console.log(`${name}: total=${buf.length} bytes, nonZero=${nonZero} samples, maxPeak=${max} (${Math.round((max / 32768) * 100)}%)`);
}
