import { isDriveConfigured } from "../services/driveService.js";
import { uploadMeetingRecording } from "../services/driveService.js";
import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";

const envPath = path.resolve(process.cwd(), ".env");
dotenv.config({ path: envPath });

console.log("Drive configured?", isDriveConfigured());

async function run() {
  const tempFile = path.resolve(process.cwd(), "temp-test-upload.webm");
  fs.writeFileSync(tempFile, "test webm content");

  console.log("Testing upload to Google Drive...");
  const res = await uploadMeetingRecording(tempFile, "test-conn", "Test Connection");
  
  if (fs.existsSync(tempFile)) {
    try { fs.unlinkSync(tempFile); } catch {}
  }

  if (res && res.driveUrl) {
    console.log("SUCCESS! Video uploaded successfully:", res.driveUrl);
  } else {
    console.log("Upload failed. See logs above.");
  }
}

run();
