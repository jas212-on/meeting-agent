import fs from "node:fs";
import path from "node:path";
import { google } from "googleapis";

export interface DriveUploadResult {
  driveUrl: string;
  driveFileId: string;
  webViewLink?: string;
  webContentLink?: string;
}

/**
 * Checks if Google Drive API credentials are configured in environment variables.
 * Supported configurations:
 * 1. GOOGLE_APPLICATION_CREDENTIALS path to service-account.json
 * 2. GOOGLE_SERVICE_ACCOUNT_JSON inline JSON string
 * 3. GOOGLE_DRIVE_REFRESH_TOKEN with GOOGLE_CLIENT_ID & GOOGLE_CLIENT_SECRET
 */
export function isDriveConfigured(): boolean {
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    const p = path.isAbsolute(process.env.GOOGLE_APPLICATION_CREDENTIALS)
      ? process.env.GOOGLE_APPLICATION_CREDENTIALS
      : path.resolve(process.cwd(), process.env.GOOGLE_APPLICATION_CREDENTIALS);
    if (fs.existsSync(p)) return true;
  }
  if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    try {
      JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
      return true;
    } catch {
      return false;
    }
  }
  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_DRIVE_REFRESH_TOKEN) {
    return true;
  }
  return false;
}

/**
 * Authenticates with Google Drive and returns an authorized drive instance.
 */
function getDriveClient() {
  const scopes = ["https://www.googleapis.com/auth/drive.file"];

  // 1. User OAuth2 Refresh Token (Prioritized if present, as it has 15GB user quota)
  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_DRIVE_REFRESH_TOKEN) {
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET
    );
    oauth2Client.setCredentials({
      refresh_token: process.env.GOOGLE_DRIVE_REFRESH_TOKEN,
    });
    return google.drive({ version: "v3", auth: oauth2Client });
  }

  // 2. Service account JSON file
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    const p = path.isAbsolute(process.env.GOOGLE_APPLICATION_CREDENTIALS)
      ? process.env.GOOGLE_APPLICATION_CREDENTIALS
      : path.resolve(process.cwd(), process.env.GOOGLE_APPLICATION_CREDENTIALS);
    if (fs.existsSync(p)) {
      const auth = new google.auth.GoogleAuth({
        keyFile: p,
        scopes,
      });
      return google.drive({ version: "v3", auth });
    }
  }

  // 3. Service account JSON inline string
  if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes,
    });
    return google.drive({ version: "v3", auth });
  }

  // 3. User OAuth2 Refresh Token
  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_DRIVE_REFRESH_TOKEN) {
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET
    );
    oauth2Client.setCredentials({
      refresh_token: process.env.GOOGLE_DRIVE_REFRESH_TOKEN,
    });
    return google.drive({ version: "v3", auth: oauth2Client });
  }

  throw new Error("No Google Drive authentication credentials provided.");
}

/**
 * Uploads a local meeting recording video to Google Drive, sets public view permissions,
 * and returns the shareable web link.
 */
export async function uploadMeetingRecording(
  localFilePath: string,
  meetingId: string,
  meetingTitle?: string
): Promise<DriveUploadResult | null> {
  if (!fs.existsSync(localFilePath)) {
    console.warn(`[DriveService] Recording file does not exist at: ${localFilePath}`);
    return null;
  }

  if (!isDriveConfigured()) {
    console.log(
      `[DriveService] Google Drive not yet configured in .env. Video safely saved locally: ${path.basename(localFilePath)}`
    );
    return null;
  }

  try {
    console.log(`[DriveService] Initializing upload for meeting "${meetingId}" to Google Drive...`);
    const drive = getDriveClient();
    const fileName = `${meetingTitle || `Google Meet ${meetingId}`} - Recording.webm`;

    const fileMetadata: Record<string, any> = {
      name: fileName,
      description: `Automated recording for meeting ${meetingId} captured by MeetMinutes bot.`,
    };

    if (process.env.GOOGLE_DRIVE_FOLDER_ID) {
      fileMetadata.parents = [process.env.GOOGLE_DRIVE_FOLDER_ID];
    }

    const media = {
      mimeType: "video/webm",
      body: fs.createReadStream(localFilePath),
    };

    const res = await drive.files.create({
      requestBody: fileMetadata,
      media,
      fields: "id, name, webViewLink, webContentLink",
      supportsAllDrives: true,
    });

    const fileId = res.data.id;
    if (!fileId) {
      throw new Error("Google Drive file upload failed - empty ID returned.");
    }

    // Grant anyone with link reader permissions for seamless viewing & sharing
    try {
      await drive.permissions.create({
        fileId,
        requestBody: {
          role: "reader",
          type: "anyone",
        },
        supportsAllDrives: true,
      });
      console.log(`[DriveService] Set public read permissions on Drive file ${fileId}`);
    } catch (permErr: any) {
      console.warn(`[DriveService] Could not set public permission on file:`, permErr.message);
    }

    const driveUrl =
      res.data.webViewLink || `https://drive.google.com/file/d/${fileId}/view?usp=sharing`;

    console.log(`[DriveService] SUCCESS: Video uploaded to Google Drive! Link: ${driveUrl}`);

    return {
      driveUrl,
      driveFileId: fileId,
      webViewLink: res.data.webViewLink ?? undefined,
      webContentLink: res.data.webContentLink ?? undefined,
    };
  } catch (err: any) {
    if (err.message?.includes("storage quota") || err.message?.includes("Service Accounts do not have storage quota")) {
      console.error(
        "[DriveService] ⚠️ Google Drive quota error: Service Accounts have 0 storage quota and cannot upload to personal folders. Please use OAuth 2.0 (GOOGLE_CLIENT_SECRET & GOOGLE_DRIVE_REFRESH_TOKEN) or a Google Workspace Shared Drive."
      );
    } else {
      console.error("[DriveService] Failed to upload recording to Google Drive:", err.message);
    }
    return null;
  }
}
