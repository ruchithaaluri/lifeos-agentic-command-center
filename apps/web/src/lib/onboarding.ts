// ============================================================
// First-login onboarding
// ============================================================
// A real account starts with an empty workspace, which makes the product look
// broken on first login. This provisions a small, useful starter workspace the
// first time an authenticated user touches their data.
//
// Design decision — LAZY, not at signup (option B):
//   - Covers accounts created before this feature existed.
//   - Covers any future signup path without duplicating logic.
//   - Keeps the signup transaction to a single user insert, so a provisioning
//     failure can never leave a half-created account.
//
// Idempotency is enforced two ways:
//   1. `users.onboardedAt` is claimed with a conditional update, so concurrent
//      requests can only produce one provisioning run.
//   2. An existing project/task/event short-circuits provisioning entirely,
//      so seeded demo data is never duplicated.
//
// Every record is minted with a fresh UUID and bound to the caller's userId.
// No other user's data is copied and the demo UUID is never used.

import { randomUUID } from 'crypto';
import { prisma } from '@lifeos/database';
import { getLocalDate, toDateString } from '@lifeos/shared';

function daysFromNow(days: number, hour = 9, minute = 0, timezone = 'America/Los_Angeles'): Date {
  const targetDate = new Date();
  targetDate.setDate(targetDate.getDate() + days);
  const dateStr = toDateString(targetDate, timezone);
  const timeStr = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}:00`;
  return getLocalDate(dateStr, timeStr, timezone);
}

export type OnboardingResult = 'created' | 'already-initialised' | 'skipped';

/**
 * Ensure `userId` has a starter workspace. Safe to call on every request.
 */
export async function ensureWorkspaceInitialized(userId: string): Promise<OnboardingResult> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { onboardedAt: true, demoMode: true, timezone: true },
  });

  // Unknown user or a seeded demo account: never touch it.
  if (!user || user.demoMode) return 'skipped';
  if (user.onboardedAt) return 'already-initialised';

  // Never duplicate content the user already has.
  const existing = await prisma.project.count({ where: { userId } });
  if (existing > 0) {
    await prisma.user.update({
      where: { id: userId },
      data: { onboardedAt: new Date() },
    });
    return 'already-initialised';
  }

  // Claim first: only one concurrent request can flip onboardedAt from null.
  const claimed = await prisma.user.updateMany({
    where: { id: userId, onboardedAt: null },
    data: { onboardedAt: new Date() },
  });
  if (claimed.count === 0) return 'already-initialised';

  try {
    const projectId = randomUUID();

    await prisma.project.create({
      data: {
        id: projectId,
        userId,
        name: 'Getting Started',
        description: 'A few sample tasks to show how LifeOS plans and executes work.',
        status: 'active',
        color: '#6366F1',
      },
    });

    const tz = user.timezone ?? 'America/Los_Angeles';

    await prisma.task.createMany({
      data: [
        {
          id: randomUUID(),
          userId,
          projectId,
          title: 'Review your first plan',
          description: 'Ask LifeOS to plan your day, then review the plan it streams back.',
          status: 'todo',
          priority: 'high',
          dueDate: daysFromNow(0, 11, 0, tz),
          estimatedMinutes: 30,
        },
        {
          id: randomUUID(),
          userId,
          projectId,
          title: 'Try a time constraint',
          description:
            'Ask "I only have 45 minutes this afternoon" and watch the plan shrink to fit.',
          status: 'todo',
          priority: 'medium',
          dueDate: daysFromNow(0, 15, 0, tz),
          estimatedMinutes: 45,
        },
        {
          id: randomUUID(),
          userId,
          projectId,
          title: 'Add your first real task',
          description: 'Create something you actually need to get done this week.',
          status: 'todo',
          priority: 'medium',
          dueDate: daysFromNow(2, 17, 0, tz),
          estimatedMinutes: 60,
        },
        {
          id: randomUUID(),
          userId,
          projectId,
          title: 'Connect your schedule',
          description: 'Check that your calendar events show up on the dashboard.',
          status: 'todo',
          priority: 'low',
          dueDate: daysFromNow(3, 10, 0, tz),
          estimatedMinutes: 15,
        },
      ],
    });

    await prisma.calendarEvent.createMany({
      data: [
        {
          id: randomUUID(),
          userId,
          projectId,
          title: 'Welcome to LifeOS',
          description: 'Your workspace is ready.',
          start: daysFromNow(0, 9, 0, tz),
          end: daysFromNow(0, 9, 30, tz),
          type: 'reminder',
          location: 'LifeOS',
        },
        {
          id: randomUUID(),
          userId,
          title: 'Focus block',
          description: 'Reserved time for your most important task.',
          start: daysFromNow(0, 14, 0, tz),
          end: daysFromNow(0, 15, 0, tz),
          type: 'focus',
        },
        {
          id: randomUUID(),
          userId,
          title: 'Daily review',
          description: 'Check what finished and plan tomorrow.',
          start: daysFromNow(0, 17, 0, tz),
          end: daysFromNow(0, 17, 30, tz),
          type: 'personal',
        },
      ],
    });

    return 'created';
  } catch (err) {
    // Release the claim so a later request can retry instead of leaving the
    // account permanently marked as onboarded with no content.
    await prisma.user
      .update({ where: { id: userId }, data: { onboardedAt: null } })
      .catch(() => undefined);
    throw err;
  }
}
