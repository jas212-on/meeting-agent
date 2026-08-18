export const selectors = {
  NAME_INPUT: 'input[aria-label="Your name"]',

  MEDIA_PROMPT_ACCEPT: 'button[aria-label="Use microphone and camera"]',
  MEDIA_PROMPT_SKIP: 'button[aria-label*="Continue without"]',

  IN_CALL: 'button[aria-label*="eave call"]',
  WAITING_ROOM: 'text=Waiting for host',
  ALONE: 'text=You\'re the only one here',
} as const;

export const joinButtonSelectors = [
  'button[aria-label="Join now"]',
  'button[data-promo-anchor-id="join-button"]',
  'button:has-text("Join now")',
] as const;

export const askToJoinButtonSelectors = [
  'button[aria-label="Ask to join"]',
  'button:has-text("Ask to join")',
] as const;