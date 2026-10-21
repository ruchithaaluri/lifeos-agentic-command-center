// ============================================================
// Demo mode utilities
// ============================================================

export const DEMO_PROMPTS = [
  "Prepare me for tomorrow's product demo.",
  'What should I work on right now?',
  'I only have 90 minutes tonight. Rebuild my plan.',
  'What am I forgetting?',
  'Move my practice session to 8 PM.',
] as const;

export type DemoPrompt = (typeof DEMO_PROMPTS)[number];

export const DEMO_USER = {
  id: '00000000-0000-0000-0000-000000000001',
  name: 'Alex Chen',
  email: 'alex.chen@lifeos.demo',
};
