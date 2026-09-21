import type { Page } from "playwright";
import {
  chatButtonSelectors,
  chatInputSelectors,
  chatSendButtonSelectors,
} from "./selectors.js";

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

export interface ChatMessage {
  id: string;
  sender: string;
  text: string;
  time?: string;
}

// Track messages recently sent by the bot so it never responds to its own replies
const sentByBotTexts = new Set<string>();

/**
 * Checks if the Google Meet in-call chat panel is currently open.
 */
export async function isChatPanelOpen(page: Page): Promise<boolean> {
  try {
    return await page.evaluate(() => {
      // 1. Check if any textarea is currently visible on the page
      const textareas = Array.from(document.querySelectorAll<HTMLTextAreaElement>("textarea"));
      const visibleTextarea = textareas.some((ta) => {
        const rect = ta.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      });
      if (visibleTextarea) return true;

      // 2. Check if chat toggle button has aria-pressed="true"
      const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>("button"));
      const chatBtn = buttons.find((b) => {
        const aria = (b.getAttribute("aria-label") || "").toLowerCase();
        return aria.includes("chat") || aria.includes("message");
      });
      if (chatBtn && chatBtn.getAttribute("aria-pressed") === "true") {
        return true;
      }

      return false;
    });
  } catch {
    return false;
  }
}

/**
 * Opens the Google Meet in-call chat panel if not already open.
 */
export async function openChatPanel(page: Page): Promise<boolean> {
  try {
    const alreadyOpen = await isChatPanelOpen(page);
    if (alreadyOpen) {
      console.log("[MeetChat] Chat panel is already OPEN.");
      return true;
    }

    console.log("[MeetChat] Attempting to open Google Meet in-call chat panel...");

    // Try finding the chat button via selectors
    for (const sel of chatButtonSelectors) {
      const btn = page.locator(sel).first();
      if (await btn.isVisible({ timeout: 400 }).catch(() => false)) {
        const label = await btn.getAttribute("aria-label").catch(() => sel);
        console.log(`[MeetChat] Clicking chat button: "${label}" (${sel})`);
        await btn.click({ timeout: 1500 }).catch(() => {});
        await sleep(600);
        if (await isChatPanelOpen(page)) {
          console.log("[MeetChat] SUCCESS: Chat panel opened via selector button.");
          return true;
        }
      }
    }

    // Fallback: evaluate inside the DOM to find any button with "chat" or "message" in aria-label
    const clicked = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>("button"));
      const chatBtn = buttons.find((b) => {
        const aria = (b.getAttribute("aria-label") || "").toLowerCase();
        return aria.includes("chat") || aria.includes("message");
      });
      if (chatBtn) {
        chatBtn.click();
        return true;
      }
      return false;
    });

    if (clicked) {
      await sleep(600);
      const isOpen = await isChatPanelOpen(page);
      console.log(`[MeetChat] Clicked chat button via DOM evaluation. Panel open: ${isOpen}`);
      return isOpen;
    }

    console.warn("[MeetChat] Warning: Could not find Google Meet chat button.");
  } catch (err) {
    console.warn("[MeetChat] Error while opening chat panel:", err);
  }
  return false;
}

/**
 * Sends a chat message into Google Meet chat.
 */
export async function sendChatMessage(page: Page, message: string): Promise<boolean> {
  try {
    console.log(`[MeetChat] 📤 Preparing to send chat reply: "${message}"`);
    await openChatPanel(page);

    // Track this message to prevent the bot from replying to itself
    const cleanNormalized = message.trim().toLowerCase();
    sentByBotTexts.add(cleanNormalized);
    // Also add without leading @mention
    sentByBotTexts.add(cleanNormalized.replace(/^@[^:]+:\s*/, ""));

    // Find the chat textarea
    let inputLocated = false;
    for (const sel of chatInputSelectors) {
      const input = page.locator(sel).first();
      if (await input.isVisible({ timeout: 800 }).catch(() => false)) {
        console.log(`[MeetChat] Found chat input element using selector: "${sel}"`);
        await input.click().catch(() => {});
        await input.fill(message);
        inputLocated = true;
        await sleep(250);

        // Try clicking send button
        let sendClicked = false;
        for (const btnSel of chatSendButtonSelectors) {
          const sendBtn = page.locator(btnSel).first();
          if (await sendBtn.isVisible({ timeout: 300 }).catch(() => false)) {
            const isDisabled = await sendBtn.getAttribute("disabled").catch(() => null);
            if (isDisabled === null) {
              console.log(`[MeetChat] Clicking send button (${btnSel})...`);
              await sendBtn.click({ timeout: 1000 }).catch(() => {});
              sendClicked = true;
              break;
            }
          }
        }

        // If send button was not clicked or disabled, press Enter
        if (!sendClicked) {
          console.log("[MeetChat] Submitting message via Enter key...");
          await input.press("Enter").catch(async () => {
            await page.keyboard.press("Enter");
          });
        }

        await sleep(300);
        console.log(`[MeetChat] ✅ Chat reply posted successfully to Google Meet!`);
        return true;
      }
    }

    // Fallback: evaluate inside DOM to find textarea
    const sentViaEval = await page.evaluate((textToSend) => {
      const ta = document.querySelector<HTMLTextAreaElement>("textarea");
      if (ta) {
        ta.focus();
        ta.value = textToSend;
        ta.dispatchEvent(new Event("input", { bubbles: true }));
        ta.dispatchEvent(new Event("change", { bubbles: true }));

        // Search for send button next to textarea or in side panel
        const sendBtn = Array.from(document.querySelectorAll<HTMLButtonElement>("button")).find((b) => {
          const aria = (b.getAttribute("aria-label") || "").toLowerCase();
          return aria.includes("send");
        });
        if (sendBtn && !sendBtn.disabled) {
          sendBtn.click();
          return true;
        }

        // Dispatch Enter key event
        const enterEvt = new KeyboardEvent("keydown", {
          key: "Enter",
          code: "Enter",
          keyCode: 13,
          which: 13,
          bubbles: true,
        });
        ta.dispatchEvent(enterEvt);
        return true;
      }
      return false;
    }, message);

    if (sentViaEval) {
      console.log(`[MeetChat] ✅ Chat reply posted successfully via DOM evaluate fallback!`);
      return true;
    }

    if (!inputLocated) {
      console.error("[MeetChat] ❌ FAILED: Could not locate chat input textarea in Google Meet.");
    }
  } catch (err) {
    console.error("[MeetChat] ❌ Error sending chat message:", err);
  }
  return false;
}

/**
 * Searches the DOM using a TreeWalker for any mentions of @MeetMinutes.
 * Isolates individual message bubbles so it never combines or re-reads the whole chat log.
 */
export async function extractMentionsFromDOM(page: Page): Promise<ChatMessage[]> {
  try {
    return await page.evaluate(() => {
      const results: Array<{ id: string; sender: string; text: string }> = [];
      const seenTexts = new Set<string>();

      // Use TreeWalker to find any text nodes containing "@meetminutes"
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      let node: Node | null;

      while ((node = walker.nextNode())) {
        const text = node.textContent?.trim() || "";
        // Match specifically @MeetMinutes (requires @ to avoid matching the bot's sender name header)
        if (text && /@meetminutes\b/i.test(text)) {
          const parent = node.parentElement;
          if (!parent) continue;

          // Ignore if inside textarea, input, script, or style
          const tagName = parent.tagName.toLowerCase();
          if (tagName === "textarea" || tagName === "input" || tagName === "script" || tagName === "style") {
            continue;
          }

          // Target ONLY the immediate message bubble element, NEVER the broad chat container or aria-live list
          const messageBlock =
            (parent.closest('[data-message-text]') as HTMLElement | null) ||
            (parent.closest('[jsname="xtSCL"]') as HTMLElement | null) ||
            parent;

          // Extract ONLY the text of this specific message bubble
          const singleMessageText = (messageBlock.innerText || text).trim();
          if (!singleMessageText || seenTexts.has(singleMessageText)) continue;
          seenTexts.add(singleMessageText);

          // Extract sender name from the message group container
          let sender = "Participant";
          const group =
            (parent.closest('[role="listitem"]') as HTMLElement | null) ||
            (parent.closest('[data-sender-name]') as HTMLElement | null) ||
            messageBlock.parentElement;

          if (group) {
            const senderAttr =
              group.getAttribute("data-sender-name") ||
              group.closest("[data-sender-name]")?.getAttribute("data-sender-name");
            if (senderAttr) {
              sender = senderAttr;
            } else {
              // Read first line of the group container if it looks like a sender name
              const lines = (group.innerText || "").split("\n").map((l: string) => l.trim()).filter(Boolean);
              if (lines.length >= 2 && !/@meetminutes/i.test(lines[0])) {
                sender = lines[0];
              }
            }
          }

          // Clean sender name (strip timestamps like "7:09 PM")
          sender = sender.replace(/\b\d{1,2}:\d{2}\s*(?:AM|PM)?\b/gi, "").trim() || "Participant";

          results.push({
            id: `mention_${singleMessageText.slice(0, 30)}`,
            sender,
            text: singleMessageText,
          });
        }
      }

      return results;
    });
  } catch {
    return [];
  }
}

export interface ChatWatcherOptions {
  page: Page;
  botDisplayName?: string;
  onMention: (message: ChatMessage) => Promise<void>;
  pollIntervalMs?: number;
}

/**
 * Starts a background monitor that watches for @MeetMinutes mentions in Google Meet chat.
 */
export function startChatWatcher(options: ChatWatcherOptions): () => void {
  const { page, botDisplayName = "MeetMinutes", onMention, pollIntervalMs = 1200 } = options;
  const processedMessageSignatures = new Set<string>();
  let active = true;
  let processingLock = false;
  let pollCount = 0;
  let lastProcessedTime = 0;

  console.log(`[MeetChat] 🚀 Started chat monitor (watching for @${botDisplayName} mentions every ${pollIntervalMs}ms)...`);

  // Ensure chat panel is opened right away
  void openChatPanel(page);

  const check = async () => {
    if (!active || page.isClosed() || processingLock) return;

    pollCount++;
    try {
      // Periodically (every 10 polls ~12s), verify that chat panel is open
      if (pollCount % 10 === 0) {
        const isOpen = await isChatPanelOpen(page);
        if (!isOpen) {
          console.log("[MeetChat] Chat panel was closed. Re-opening in background...");
          await openChatPanel(page);
        }
      }

      const mentions = await extractMentionsFromDOM(page);

      if (mentions.length > 0) {
        for (const msg of mentions) {
          const rawTextClean = msg.text.trim().toLowerCase();
          const cleanSender = msg.sender.trim().toLowerCase();

          // 1. Ignore if sender is MeetMinutes or the bot
          if (cleanSender.includes("meetminutes") || (botDisplayName && cleanSender.includes(botDisplayName.toLowerCase()))) {
            continue;
          }

          // 2. Check if this text or signature was already processed
          const sig = `${cleanSender}:::${rawTextClean}`;
          if (processedMessageSignatures.has(sig) || processedMessageSignatures.has(rawTextClean)) {
            continue;
          }

          // 3. Ignore if this text was sent by the bot
          if (sentByBotTexts.has(rawTextClean) || sentByBotTexts.has(rawTextClean.replace(/^@[^:]+:\s*/, ""))) {
            continue;
          }

          // Cooldown check (prevent burst loops within 2.5s)
          const now = Date.now();
          if (now - lastProcessedTime < 2500) {
            continue;
          }

          // Mark message as processed IMMEDIATELY before starting response generation
          processedMessageSignatures.add(sig);
          processedMessageSignatures.add(rawTextClean);
          lastProcessedTime = now;

          console.log(`[MeetChat] 📥 🔔 Mention detected in chat! Sender: "${msg.sender}", Message: "${msg.text}"`);

          processingLock = true;
          try {
            await onMention(msg);
          } catch (err) {
            console.error("[MeetChat] ❌ Error in onMention handler:", err);
          } finally {
            processingLock = false;
          }
        }
      }
    } catch {
      // Ignore transient errors when navigating or evaluating
    }
  };

  const timer = setInterval(() => {
    void check();
  }, pollIntervalMs);

  return () => {
    active = false;
    clearInterval(timer);
    console.log("[MeetChat] Chat monitor stopped.");
  };
}

