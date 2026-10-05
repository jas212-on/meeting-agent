import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import { generateMeetingSummary, transcribeAudioWithGroqWhisper } from "../services/groqService.js";

dotenv.config({ path: path.resolve(".env") });

export async function runGroqUnitTests() {
  console.log("==================================================");
  console.log("   UNIT TESTS: UT-05, UT-06, UT-07, UT-08         ");
  console.log("==================================================");

  // UT-05: generateMeetingSummary() with rawTranscript = ""
  console.log("\n[UT-05] Testing generateMeetingSummary() with empty transcript...");
  const ut05Res = await generateMeetingSummary("", { meetingId: "ut-05-empty-test" });
  if (!ut05Res || !ut05Res.summary || !Array.isArray(ut05Res.actionItems)) {
    throw new Error("UT-05 failed: Empty meeting minutes structure not returned");
  }
  console.log("✓ UT-05 PASS: Handled short transcript boundary; returned structured empty minutes.");

  // UT-06: generateMeetingSummary() with valid transcript and GROQ_API_KEY absent
  console.log("\n[UT-06] Testing generateMeetingSummary() with absent GROQ_API_KEY fallback...");
  const savedKey = process.env.GROQ_API_KEY;
  try {
    delete process.env.GROQ_API_KEY;
    const ut06Res = await generateMeetingSummary(
      "Alice reviewed the database schema and Bob approved the deployment for Friday.",
      { meetingId: "ut-06-fallback-test", attendeeNames: ["Alice", "Bob"] }
    );
    if (!ut06Res || !ut06Res.summary || !ut06Res.summary.includes("Live meeting session")) {
      throw new Error("UT-06 failed: Fallback meeting minutes structure not returned");
    }
    console.log("✓ UT-06 PASS: Notice logged; returned valid structured fallback minutes without unhandled exceptions.");
  } finally {
    process.env.GROQ_API_KEY = savedKey;
  }

  // UT-07: transcribeAudioWithGroqWhisper() with non-existent audio path
  console.log("\n[UT-07] Testing transcribeAudioWithGroqWhisper() with non-existent audio path...");
  const nonExistentPath = path.resolve(process.cwd(), "missing-test-audio-12345.webm");
  const ut07Res = await transcribeAudioWithGroqWhisper(nonExistentPath);
  if (ut07Res.text !== "" || ut07Res.segments.length !== 0) {
    throw new Error("UT-07 failed: Non-existent file did not return empty result");
  }
  console.log("✓ UT-07 PASS: Filesystem check handled non-existent path safely; returned { text: '', segments: [] }.");

  // UT-08: transcribeAudioWithGroqWhisper() with audio file size < 1000 bytes
  console.log("\n[UT-08] Testing transcribeAudioWithGroqWhisper() with file size < 1000 bytes...");
  const tinyFile = path.resolve(process.cwd(), "temp-tiny-audio-test.webm");
  fs.writeFileSync(tinyFile, Buffer.alloc(128)); // 128 bytes (< 1000 bytes)
  try {
    const ut08Res = await transcribeAudioWithGroqWhisper(tinyFile);
    if (ut08Res.text !== "" || ut08Res.segments.length !== 0) {
      throw new Error("UT-08 failed: Tiny file size guard (<1000 bytes) did not return empty result");
    }
    console.log("✓ UT-08 PASS: File size guard (<1000 bytes) triggered; returned { text: '', segments: [] }.");
  } finally {
    if (fs.existsSync(tinyFile)) {
      try { fs.unlinkSync(tinyFile); } catch {}
    }
  }

  console.log("\n==================================================");
  console.log("   ALL 4 GROQ SERVICE UNIT TESTS PASSED!          ");
  console.log("==================================================");
}

runGroqUnitTests().catch((err) => {
  console.error("Unit test execution failed:", err);
  process.exit(1);
});
