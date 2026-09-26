import http from "node:http";
import url from "node:url";
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import dotenv from "dotenv";
import { google } from "googleapis";

const envPath = path.resolve(process.cwd(), ".env");
dotenv.config({ path: envPath });

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function prompt(query: string): Promise<string> {
  return new Promise((resolve) => rl.question(query, resolve));
}

async function main() {
  console.log("\n========================================================");
  console.log("   Google Drive OAuth2 Setup (Personal Google Drive)    ");
  console.log("========================================================\n");
  console.log("Service Accounts cannot upload to personal Google Drive folders");
  console.log("because Google gives Service Accounts 0 storage quota.");
  console.log("This setup connects your own Google account (15GB free storage).\n");

  let clientId = process.env.GOOGLE_CLIENT_ID || "";
  let clientSecret = process.env.GOOGLE_CLIENT_SECRET || "";

  if (!clientId || clientId.includes("your_google_client_id")) {
    clientId = await prompt("Enter your GOOGLE_CLIENT_ID: ");
  } else {
    console.log(`Using GOOGLE_CLIENT_ID from .env: ${clientId.slice(0, 15)}...`);
  }

  if (!clientSecret || clientSecret.includes("your_google_client_secret")) {
    clientSecret = await prompt("Enter your GOOGLE_CLIENT_SECRET: ");
  }

  if (!clientId || !clientSecret) {
    console.error("Client ID and Client Secret are required.");
    rl.close();
    process.exit(1);
  }

  const port = 3333;
  const redirectUri = `http://localhost:${port}/oauth2callback`;

  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: ["https://www.googleapis.com/auth/drive.file"],
  });

  console.log("\n1. Make sure you added this Redirect URI in Google Cloud Console:");
  console.log(`   --> ${redirectUri}`);
  console.log("   (Under Credentials -> Your OAuth 2.0 Client ID -> Authorized redirect URIs)\n");

  console.log("2. Open this URL in your browser to authorize access:\n");
  console.log(authUrl);
  console.log("\nWaiting for authorization on localhost...\n");

  const server = http.createServer(async (req, res) => {
    try {
      if (req.url?.startsWith("/oauth2callback")) {
        const parsed = url.parse(req.url, true);
        const code = parsed.query.code as string;

        if (!code) {
          res.writeHead(400, { "Content-Type": "text/html" });
          res.end("<h3>Missing authorization code.</h3>");
          return;
        }

        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(
          "<h3>Authorization Successful!</h3><p>You can close this tab and return to the terminal.</p>"
        );

        const { tokens } = await oauth2Client.getToken(code);
        const refreshToken = tokens.refresh_token;

        if (!refreshToken) {
          console.error(
            "\nWarning: Google didn't return a refresh_token. (Maybe already authorized? Re-run and choose prompt=consent)."
          );
        } else {
          console.log("\n SUCCESS! Refresh Token received.");

          // Update backend/.env
          let envContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf-8") : "";

          // Remove or comment out GOOGLE_APPLICATION_CREDENTIALS so it doesn't conflict
          envContent = envContent.replace(
            /^(GOOGLE_APPLICATION_CREDENTIALS=.*)$/gm,
            "# $1 (disabled in favor of OAuth2 personal Drive)"
          );

          // Update or add GOOGLE_CLIENT_ID
          if (envContent.includes("GOOGLE_CLIENT_ID=")) {
            envContent = envContent.replace(/GOOGLE_CLIENT_ID=.*/g, `GOOGLE_CLIENT_ID=${clientId}`);
          } else {
            envContent += `\nGOOGLE_CLIENT_ID=${clientId}`;
          }

          // Update or add GOOGLE_CLIENT_SECRET
          if (envContent.includes("GOOGLE_CLIENT_SECRET=")) {
            envContent = envContent.replace(
              /GOOGLE_CLIENT_SECRET=.*/g,
              `GOOGLE_CLIENT_SECRET=${clientSecret}`
            );
          } else {
            envContent += `\nGOOGLE_CLIENT_SECRET=${clientSecret}`;
          }

          // Update or add GOOGLE_DRIVE_REFRESH_TOKEN
          if (envContent.includes("GOOGLE_DRIVE_REFRESH_TOKEN=")) {
            envContent = envContent.replace(
              /GOOGLE_DRIVE_REFRESH_TOKEN=.*/g,
              `GOOGLE_DRIVE_REFRESH_TOKEN=${refreshToken}`
            );
          } else {
            envContent += `\nGOOGLE_DRIVE_REFRESH_TOKEN=${refreshToken}`;
          }

          fs.writeFileSync(envPath, envContent.trim() + "\n", "utf-8");
          console.log(" Updated backend/.env automatically with your OAuth credentials!");

          // Test upload
          oauth2Client.setCredentials({ refresh_token: refreshToken });
          const drive = google.drive({ version: "v3", auth: oauth2Client });
          const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;

          console.log("\nTesting upload to your Google Drive...");
          const uploadRes = await drive.files.create({
            requestBody: {
              name: `connection-test-${Date.now()}.txt`,
              parents: folderId ? [folderId] : undefined,
            },
            media: {
              mimeType: "text/plain",
              body: "Meeting Agent Google Drive connection verified successfully!",
            },
            fields: "id, name, webViewLink",
          });

          console.log(` Test file uploaded successfully!`);
          console.log(` File Name: ${uploadRes.data.name}`);
          console.log(` View Link: ${uploadRes.data.webViewLink}\n`);
          console.log("Ready! Future meeting recordings will now upload automatically.");
        }

        server.close();
        rl.close();
        process.exit(0);
      }
    } catch (err: any) {
      console.error("\nFailed to exchange token:", err.message);
      res.writeHead(500, { "Content-Type": "text/html" });
      res.end(`<h3>Error: ${err.message}</h3>`);
      server.close();
      rl.close();
      process.exit(1);
    }
  });

  server.listen(port, () => {
    console.log(`Temporary OAuth receiver listening at http://localhost:${port}/oauth2callback`);
  });
}

main().catch((err) => {
  console.error("Error:", err);
  rl.close();
  process.exit(1);
});
