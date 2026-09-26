import mongoose from "mongoose";
import dotenv from "dotenv";
dotenv.config();

async function run() {
  await mongoose.connect(process.env.MONGODB_URI!);
  const m = await mongoose.connection.collection("meetings").findOne({ meetingId: "jkv-cdhw-nfe" });
  if (m) {
    console.log("=== Meeting jkv-cdhw-nfe ===");
    console.log("Transcript:", JSON.stringify(m.transcript, null, 2));
    console.log("Recording:", JSON.stringify(m.recording, null, 2));
    console.log("--- Logs ---");
    for (const log of m.rawLogs || []) {
      if (
        log.includes("Vapi") ||
        log.includes("AudioPipeline") ||
        log.includes("voice") ||
        log.includes("peak") ||
        log.includes("transcript") ||
        log.includes("ScreenRecorder") ||
        log.includes("AudioBridge") ||
        log.includes("speech")
      ) {
        if (!log.includes("Voice sent to Vapi") && !log.includes("[partial]")) {
          console.log(log);
        }
      }
    }
  } else {
    console.log("Not found");
  }
  await mongoose.disconnect();
}
run();
