export const selectors = {
  NAME_INPUT: 'input[aria-label="Your name"]',

  MEDIA_PROMPT_ACCEPT: 'button[aria-label="Use microphone and camera"]',
  MEDIA_PROMPT_SKIP: 'button[aria-label*="Continue without"]',

  IN_CALL: 'button[aria-label*="eave call"]',
  WAITING_ROOM: 'text=Waiting for host',
  ALONE: 'text=You\'re the only one here',

  MIC_ON: 'button[aria-label*="Turn on microphone"]',
  MIC_OFF: 'button[aria-label*="Turn off microphone"]',
  CAMERA_ON: 'button[aria-label*="Turn off camera"]',
} as const;

export const mediaPromptSelectors = [
  'button:has-text("Continue without camera")',
  'button:has-text("Continue without microphone and camera")',
  'button:has-text("Continue without")',
  'div[role="dialog"] button:has-text("Dismiss")',
  'div[role="dialog"] button:has-text("Got it")',
  'div[role="dialog"] button:has-text("Close")',
  'div[role="alertdialog"] button',
  'button[aria-label="Use microphone and camera"]',
] as const;

export const joinButtonSelectors = [
  'button[aria-label*="Join now" i]',
  'button[aria-label*="Join" i]',
  'button[data-promo-anchor-id="join-button"]',
  'button[jsname="Qx7uuf"]',
  'button:has-text("Join now")',
  'button:has-text("Join")',
  'span:has-text("Join now")',
  'span:has-text("Join")',
] as const;

export const askToJoinButtonSelectors = [
  'button[aria-label*="Ask to join" i]',
  'button[jsname="Qx7uuf"]',
  'button:has-text("Ask to join")',
  'span:has-text("Ask to join")',
] as const;

export const callEndedSelectors = [
  'button:has-text("Return to home screen")',
  'a:has-text("Return to home screen")',
  'button:has-text("Rejoin")',
  'button:has-text("Join again")',
  'span:has-text("Return to home screen")',
  'span:has-text("Rejoin")',
  'text=/You(\'ve| have)? left the meeting/i',
  'text=/You(\'ve| have)? been removed/i',
  'text=/The meeting has ended/i',
  'text=/The host ended the meeting/i',
  'text=/The host has ended/i',
  'text=/This meeting has ended/i',
  'text=/Ready to rejoin/i',
  'text=/Submit feedback/i',
  'div[role="dialog"]:has-text("ended")',
  'div[role="alertdialog"]:has-text("ended")',
] as const;

export const aloneSelectors = [
  'text=/You(\'re| are) the only one here/i',
  'text=/Everyone else has left/i',
  'text=/Everyone else left/i',
  'text=/Ready to leave/i',
  'text=/all other participants have left/i',
  'text=/No one else is here/i',
  'text=/Waiting for others to join/i',
] as const;

export const chatButtonSelectors = [
  'button[aria-label*="Chat with everyone" i]',
  'button[aria-label*="In-call messages" i]',
  'button[aria-label*="Chat" i]',
  'button[aria-label*="messages" i]',
  'button[data-panel-id="2"]',
  'button[jsname="A5il2e"]',
  'button:has(i:has-text("chat"))',
] as const;

export const chatPanelSelectors = [
  'div[data-side-panel-id="2"]',
  'div[aria-label*="In-call messages" i]',
  'div[aria-label*="Chat with everyone" i]',
  'div[role="region"][aria-label*="chat" i]',
  'div[role="complementary"]',
] as const;

export const chatInputSelectors = [
  'textarea[aria-label*="Send a message" i]',
  'textarea[name="chatTextInput"]',
  'textarea[aria-label*="Chat" i]',
  'textarea[placeholder*="Send a message" i]',
  'textarea[placeholder*="message" i]',
  'div[contenteditable="true"][aria-label*="Send a message" i]',
  'div[contenteditable="true"][role="textbox"]',
  'div[role="textbox"]',
  'textarea',
] as const;

export const chatSendButtonSelectors = [
  'button[aria-label*="Send a message" i]',
  'button[aria-label*="Send message" i]',
  'button[jsname="So7YBf"]',
  'button:has(i:has-text("send"))',
  'button:has(span:has-text("send"))',
] as const;