import mongoose from "mongoose";
import dotenv from "dotenv";
dotenv.config();

async function run() {
  await mongoose.connect(process.env.MONGODB_URI!);
  const m = await mongoose.connection.collection("meetings").findOne({ meetingId: "oyv-gstt-ooj" });
  if (m) {
    console.log("=== Vapi & Speech Logs for oyv-gstt-ooj ===");
    for (const log of m.rawLogs || []) {
      if (
        log.includes("Vapi") ||
        log.includes("voice") ||
        log.includes("transcript") ||
        log.includes("TRANSCRIPT") ||
        log.includes("transcribed") ||
        log.includes("Conversation") ||
        log.includes("Assistant") ||
        log.includes("User")
      ) {
        if (!log.includes("Voice sent to Vapi")) {
          console.log(log);
        }
      }
    }
  }
  await mongoose.disconnect();
}
run();
