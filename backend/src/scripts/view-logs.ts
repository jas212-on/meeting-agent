import mongoose from "mongoose";
import dotenv from "dotenv";
dotenv.config();

async function run() {
  const uri = process.env.MONGODB_URI!;
  await mongoose.connect(uri);
  const meetingCol = mongoose.connection.collection("meetings");
  const meeting = await meetingCol.findOne({ meetingId: "oyv-gstt-ooj" });
  if (meeting) {
    const logs: string[] = meeting.rawLogs || [];
    console.log("Total log lines:", logs.length);
    console.log("--- First 80 logs for oyv-gstt-ooj ---");
    logs.slice(0, 80).forEach((l) => console.log(l));
  } else {
    console.log("Meeting oyv-gstt-ooj not found in DB");
  }
  await mongoose.disconnect();
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
