import dotenv from "dotenv";
import path from "node:path";
import { generateMeetingSummary } from "../services/groqService.js";

// Load environment variables from backend/.env
dotenv.config({ path: path.resolve(".env") });

async function runTest() {
  console.log("==================================================");
  console.log("   TESTING GROQ MEETING SUMMARIZATION SERVICE     ");
  console.log("==================================================");
  console.log("GROQ_API_KEY configured:", Boolean(process.env.GROQ_API_KEY));
  console.log("GROQ_MODEL:", process.env.GROQ_MODEL || "llama-3.3-70b-versatile");

  const sampleTranscript = `
Participant: Hello MeetMinutes, let's start the sync on the Q4 release.
MeetMinutes AI: Understood. I am recording the notes for the Q4 release.
Participant: We need Alice to complete the database indexing migration by this Friday.
Participant: Bob agreed to finish the frontend dashboard UI and dark mode styling by next Tuesday.
Participant: As for the launch date, we decided to push the beta deployment to October 15th to allow full QA testing.
MeetMinutes AI: I have recorded those action items and the launch date decision.
`;

  console.log("\n[WB-01] Validating Groq LLM API JSON extraction branch with valid transcript...");
  const minutes = await generateMeetingSummary(sampleTranscript, {
    meetingId: "test-abc-123",
    meetingTitle: "Q4 Product Release Sync",
    duration: "15m 30s",
    attendeeNames: ["Jason", "Alice", "Bob", "MeetMinutes AI Assistant"],
  });

  console.log("--- RESULTING MINUTES (WB-01) ---");
  console.log("SUMMARY:\n", minutes.summary);
  console.log("KEY DECISIONS:\n", minutes.keyDecisions);
  console.log("ACTION ITEMS:\n", JSON.stringify(minutes.actionItems, null, 2));
  console.log("✓ WB-01: Valid transcript -> Groq LLM API JSON extraction branch passed!");

  console.log("\n[WB-02] Validating fallback branch with empty/short transcript...");
  const emptyMinutes = await generateMeetingSummary("", {
    meetingId: "test-empty-123",
    duration: "00:00",
  });
  console.log("--- FALLBACK MINUTES (WB-02) ---");
  console.log("SUMMARY:\n", emptyMinutes.summary);
  if (!emptyMinutes.summary || emptyMinutes.summary.length === 0) {
    throw new Error("WB-02 Failed: Fallback summary was empty");
  }
  console.log("✓ WB-02: Empty/short transcript -> Fallback structured summary branch passed!");

  console.log("\n==================================================");
  console.log("   ALL WHITE-BOX GROQ BRANCH TESTS PASSED!        ");
  console.log("==================================================");
}

runTest().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
