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