import dotenv from "dotenv";
import mongoose from "mongoose";
import { connectDB, closeDB } from "../config/db.js";
import { User } from "../models/User.js";
import { Meeting } from "../models/Meeting.js";

dotenv.config();

async function initDB() {
  console.log("==================================================");
  console.log("🚀 Initializing Meeting Agent Database (MongoDB)...");
  console.log("==================================================");

  try {
    // Connect to database
    await connectDB();
    const db = mongoose.connection.db;

    if (!db) {
      throw new Error("Failed to get native MongoDB database instance");
    }

    console.log(`\n📦 Target Database: "${mongoose.connection.name}"`);

    // Build/Sync indexes for all models
    console.log("\n⚙️  Synchronizing Model Schemas & Indexes...");

    await User.init();
    console.log("  ✓ User collection indexes verified");

    await Meeting.init();
    console.log("  ✓ Meeting collection indexes verified");

    // Inspect Collections
    const collections = await db.listCollections().toArray();
    console.log(`\n📋 Active Collections (${collections.length}):`);
    for (const col of collections) {
      const colInstance = db.collection(col.name);
      const docCount = await colInstance.countDocuments();
      const indexes = await colInstance.indexes();
      console.log(`  • ${col.name}: ${docCount} documents, ${indexes.length} index(es)`);
      for (const idx of indexes) {
        console.log(`    - Index: ${idx.name} (${JSON.stringify(idx.key)})`);
      }
    }

    console.log("\n✨ Database initialization completed successfully!");
    console.log("   Zero mock data injected. Ready for production usage.\n");
  } catch (err: any) {
    console.error("\n❌ Database initialization failed:", err.message);
    process.exit(1);
  } finally {
    await closeDB();
    process.exit(0);
  }
}

initDB();
