import { NextResponse } from 'next/server';
import { prisma } from '@lifeos/database';
import { resolveUserId, getDemoUserId } from '@/lib/server-auth';

export async function POST() {
  // Reset only ever touches the seeded demo workspace, so it stays scoped to
  // the demo user even when a real account is signed in.
  const guard = await resolveUserId();
  if (!guard) {
    return NextResponse.json(
      { error: { code: 'UNAUTHORIZED', message: 'Sign in to continue.' } },
      { status: 401 },
    );
  }

  const DEMO_USER_ID = getDemoUserId();

  try {
    // Clear agent history
    await prisma.agentAction.deleteMany({ where: { session: { userId: DEMO_USER_ID } } });
    await prisma.agentSession.deleteMany({ where: { userId: DEMO_USER_ID } });
    await prisma.calendarEvent.deleteMany({ where: { userId: DEMO_USER_ID } });
    await prisma.task.deleteMany({ where: { userId: DEMO_USER_ID } });
    await prisma.project.deleteMany({ where: { userId: DEMO_USER_ID } });

    // Re-seed — import seed logic inline
    await seedDemoData(DEMO_USER_ID);

    return NextResponse.json({ success: true, message: 'Demo data reset successfully.' });
  } catch (err) {
    // Log the detail server-side; return a generic message so no internal
    // error text reaches the client.
    console.error('api/demo/reset failed', {
      message: err instanceof Error ? err.message : 'unknown',
    });
    return NextResponse.json(
      { error: { code: 'RESET_FAILED', message: 'Reset failed. Please try again.' } },
      { status: 500 },
    );
  }
}

async function seedDemoData(userId: string) {
  function daysFromNow(days: number, hour = 9, minute = 0): Date {
    const d = new Date();
    d.setDate(d.getDate() + days);
    d.setHours(hour, minute, 0, 0);
    return d;
  }

  const [projectLaunch, projectWebsite, projectApi] = await Promise.all([
    prisma.project.create({
      data: {
        id: '00000000-0000-0000-0001-000000000001',
        userId,
        name: 'Product Launch',
        description: 'Q4 product launch including demo, press kit, and onboarding materials.',
        status: 'active',
        color: '#3B82F6',
      },
    }),
    prisma.project.create({
      data: {
        id: '00000000-0000-0000-0001-000000000002',
        userId,
        name: 'Website Redesign',
        description: 'Full redesign of marketing site with updated brand.',
        status: 'active',
        color: '#8B5CF6',
      },
    }),
    prisma.project.create({
      data: {
        id: '00000000-0000-0000-0001-000000000003',
        userId,
        name: 'API Integration',
        description: 'Partner API integration for data sync pipeline.',
        status: 'active',
        color: '#06B6D4',
      },
    }),
  ]);

  await prisma.task.createMany({
    data: [
      {
        id: '00000000-0000-0000-0002-000000000001',
        userId,
        projectId: projectLaunch.id,
        title: 'Finish presentation slides',
        description: 'Complete all 18 slides for the product demo.',
        status: 'in_progress',
        priority: 'urgent',
        dueDate: daysFromNow(1, 10, 0),
        estimatedMinutes: 90,
      },
      {
        id: '00000000-0000-0000-0002-000000000002',
        userId,
        projectId: projectLaunch.id,
        title: 'Prepare talking points',
        description: 'Write 3-sentence talking point per slide.',
        status: 'todo',
        priority: 'urgent',
        dueDate: daysFromNow(1, 9, 0),
        estimatedMinutes: 45,
      },
      {
        id: '00000000-0000-0000-0002-000000000003',
        userId,
        projectId: projectLaunch.id,
        title: 'Practice product demo',
        description: 'Run through the full demo flow at least twice.',
        status: 'todo',
        priority: 'high',
        dueDate: daysFromNow(1, 8, 0),
        estimatedMinutes: 30,
      },
      {
        id: '00000000-0000-0000-0002-000000000004',
        userId,
        projectId: projectLaunch.id,
        title: 'Review launch checklist',
        description: 'Go through the 40-item launch checklist.',
        status: 'todo',
        priority: 'high',
        dueDate: daysFromNow(2, 17, 0),
        estimatedMinutes: 30,
      },
      {
        id: '00000000-0000-0000-0002-000000000005',
        userId,
        projectId: projectLaunch.id,
        title: 'Write release notes',
        description: 'Draft v2.0 release notes covering all new features.',
        status: 'todo',
        priority: 'medium',
        dueDate: daysFromNow(3, 17, 0),
        estimatedMinutes: 60,
      },
      {
        id: '00000000-0000-0000-0002-000000000006',
        userId,
        projectId: projectApi.id,
        title: 'Review API PR',
        description: 'Review and approve the partner API integration PR.',
        status: 'todo',
        priority: 'high',
        dueDate: daysFromNow(0, 11, 30),
        estimatedMinutes: 20,
      },
      {
        id: '00000000-0000-0000-0002-000000000007',
        userId,
        projectId: projectApi.id,
        title: 'Send API credentials',
        description: 'Send staging API credentials to partner team.',
        status: 'todo',
        priority: 'medium',
        dueDate: daysFromNow(0, 16, 0),
        estimatedMinutes: 10,
      },
      {
        id: '00000000-0000-0000-0002-000000000008',
        userId,
        projectId: projectWebsite.id,
        title: 'Review homepage design mockup',
        description: 'Review Figma mockup from design team and leave feedback.',
        status: 'in_progress',
        priority: 'medium',
        dueDate: daysFromNow(1, 17, 0),
        estimatedMinutes: 30,
      },
    ],
  });

  await prisma.calendarEvent.createMany({
    data: [
      {
        id: '00000000-0000-0000-0003-000000000001',
        userId,
        title: 'Team Standup',
        start: daysFromNow(0, 9, 30),
        end: daysFromNow(0, 9, 50),
        type: 'meeting',
        location: 'Zoom',
      },
      {
        id: '00000000-0000-0000-0003-000000000002',
        userId,
        title: 'Product Meeting',
        start: daysFromNow(0, 11, 0),
        end: daysFromNow(0, 12, 0),
        type: 'meeting',
        location: 'Conference Room B',
        projectId: projectLaunch.id,
      },
      {
        id: '00000000-0000-0000-0003-000000000003',
        userId,
        title: 'Lunch',
        start: daysFromNow(0, 12, 30),
        end: daysFromNow(0, 13, 30),
        type: 'break',
      },
      {
        id: '00000000-0000-0000-0003-000000000004',
        userId,
        title: 'Design Review',
        start: daysFromNow(0, 15, 0),
        end: daysFromNow(0, 16, 0),
        type: 'meeting',
        projectId: projectWebsite.id,
      },
      {
        id: '00000000-0000-0000-0003-000000000005',
        userId,
        title: 'Demo Practice',
        start: daysFromNow(0, 18, 30),
        end: daysFromNow(0, 19, 0),
        type: 'focus',
        projectId: projectLaunch.id,
      },
      {
        id: '00000000-0000-0000-0003-000000000006',
        userId,
        title: 'Product Demo',
        description: 'Live product demo for investors.',
        start: daysFromNow(1, 10, 0),
        end: daysFromNow(1, 11, 0),
        type: 'meeting',
        location: 'Main Conference Room',
        projectId: projectLaunch.id,
      },
      {
        id: '00000000-0000-0000-0003-000000000007',
        userId,
        title: 'Team Standup',
        start: daysFromNow(1, 9, 30),
        end: daysFromNow(1, 9, 50),
        type: 'meeting',
        location: 'Zoom',
      },
      {
        id: '00000000-0000-0000-0003-000000000008',
        userId,
        title: 'Sprint Planning',
        start: daysFromNow(2, 10, 0),
        end: daysFromNow(2, 11, 30),
        type: 'meeting',
      },
    ],
  });
}
