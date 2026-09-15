import mongoose from "mongoose";

let isConnected = false;

export async function connectDB(): Promise<typeof mongoose> {
  if (isConnected && mongoose.connection.readyState === 1) {
    return mongoose;
  }

  const uri = process.env.MONGODB_URI;

  if (!uri) {
    console.error("❌ MONGODB_URI is not defined in environment variables");
    process.exit(1);
  }

  try {
    // Event listeners
    mongoose.connection.on("connected", () => {
      isConnected = true;
    });

    mongoose.connection.on("error", (err) => {
      console.error("❌ MongoDB connection error:", err);
    });

    mongoose.connection.on("disconnected", () => {
      isConnected = false;
      console.warn("⚠️ MongoDB disconnected.");
    });

    const conn = await mongoose.connect(uri, {
      maxPoolSize: 10,
      minPoolSize: 2,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });

    console.log(`✅ MongoDB Connected: ${conn.connection.host} [DB: ${conn.connection.name}]`);
    return conn;
  } catch (error) {
    console.error("❌ Error connecting to MongoDB:", error);
    process.exit(1);
  }
}

export async function closeDB(): Promise<void> {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
    isConnected = false;
    console.log("🔌 MongoDB connection closed gracefully.");
  }
}

export function getDBStatus() {
  const readyStates: Record<number, string> = {
    0: "disconnected",
    1: "connected",
    2: "connecting",
    3: "disconnecting",
  };

  return {
    state: readyStates[mongoose.connection.readyState] || "unknown",
    readyState: mongoose.connection.readyState,
    dbName: mongoose.connection.name || null,
    host: mongoose.connection.host || null,
  };
}
