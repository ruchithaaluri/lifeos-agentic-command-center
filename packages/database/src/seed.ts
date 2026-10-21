// ============================================================
// LifeOS Demo Seed Script
// Creates a realistic demo account for Alex Chen with tasks,
// projects, and calendar events centered on the hackathon demo
// scenario: product demo is tomorrow at 10 AM.
// ============================================================

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// ── Helpers ────────────────────────────────────────────────────────────────

function daysFromNow(days: number, hour = 9, minute = 0): Date {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(hour, minute, 0, 0);
  return d;
}

function _hoursFromNow(hours: number): Date {
  return new Date(Date.now() + hours * 60 * 60 * 1000);
}

// ── Main Seed ──────────────────────────────────────────────────────────────

async function main() {
  console.info('🌱  Starting LifeOS demo seed...');

  // ── Clean existing demo data ──────────────────────────────
  await prisma.agentAction.deleteMany();
  await prisma.agentSession.deleteMany();
  await prisma.calendarEvent.deleteMany();
  await prisma.task.deleteMany();
  await prisma.project.deleteMany();
  await prisma.user.deleteMany({ where: { demoMode: true } });

  // ── Demo User ─────────────────────────────────────────────
  const user = await prisma.user.create({
    data: {
      id: '00000000-0000-0000-0000-000000000001',
      email: 'alex.chen@lifeos.demo',
      name: 'Alex Chen',
      demoMode: true,
      timezone: 'America/Los_Angeles',
      // password: lifeos-demo-2026
      passwordHash:
        'scrypt$4f18bb12e72b60c1338519158c234987$513bc3a7800fa35e49be9c8309822e46db6971669eec56464234fdb4c941639a19e1d9ddb0741323304d363d025578edc57fdd75be166a30dccdf8202f87e8fc',
    },
  });

  console.info(`✓  Created user: ${user.name} (${user.email})`);

  // ── Projects ──────────────────────────────────────────────
  const [projectLaunch, projectWebsite, projectApi] = await Promise.all([
    prisma.project.create({
      data: {
        id: '00000000-0000-0000-0001-000000000001',
        userId: user.id,
        name: 'Product Launch',
        description: 'Q4 product launch including demo, press kit, and onboarding materials.',
        status: 'active',
        color: '#3B82F6',
      },
    }),
    prisma.project.create({
      data: {
        id: '00000000-0000-0000-0001-000000000002',
        userId: user.id,
        name: 'Website Redesign',
        description: 'Full redesign of marketing site with updated brand.',
        status: 'active',
        color: '#8B5CF6',
      },
    }),
    prisma.project.create({
      data: {
        id: '00000000-0000-0000-0001-000000000003',
        userId: user.id,
        name: 'API Integration',
        description: 'Partner API integration for data sync pipeline.',
        status: 'active',
        color: '#06B6D4',
      },
    }),
  ]);

  console.info('✓  Created 3 projects');

  // ── Tasks ─────────────────────────────────────────────────
  const tasks = await Promise.all([
    // Product Launch tasks
    prisma.task.create({
      data: {
        id: '00000000-0000-0000-0002-000000000001',
        userId: user.id,
        projectId: projectLaunch.id,
        title: 'Finish presentation slides',
        description:
          'Complete all 18 slides for the product demo. Slides 12-18 are still missing content.',
        status: 'in_progress',
        priority: 'urgent',
        dueDate: daysFromNow(1, 10, 0),
        estimatedMinutes: 90,
      },
    }),
    prisma.task.create({
      data: {
        id: '00000000-0000-0000-0002-000000000002',
        userId: user.id,
        projectId: projectLaunch.id,
        title: 'Prepare talking points',
        description: 'Write 3-sentence talking point per slide for the live demo.',
        status: 'todo',
        priority: 'urgent',
        dueDate: daysFromNow(1, 9, 0),
        estimatedMinutes: 45,
      },
    }),
    prisma.task.create({
      data: {
        id: '00000000-0000-0000-0002-000000000003',
        userId: user.id,
        projectId: projectLaunch.id,
        title: 'Practice product demo',
        description: 'Run through the full demo flow at least twice. Time it to under 20 minutes.',
        status: 'todo',
        priority: 'high',
        dueDate: daysFromNow(1, 8, 0),
        estimatedMinutes: 30,
      },
    }),
    prisma.task.create({
      data: {
        id: '00000000-0000-0000-0002-000000000004',
        userId: user.id,
        projectId: projectLaunch.id,
        title: 'Review launch checklist',
        description: 'Go through the 40-item launch checklist and mark completed items.',
        status: 'todo',
        priority: 'high',
        dueDate: daysFromNow(2, 17, 0),
        estimatedMinutes: 30,
      },
    }),
    prisma.task.create({
      data: {
        id: '00000000-0000-0000-0002-000000000005',
        userId: user.id,
        projectId: projectLaunch.id,
        title: 'Write release notes',
        description: 'Draft v2.0 release notes covering all new features.',
        status: 'todo',
        priority: 'medium',
        dueDate: daysFromNow(3, 17, 0),
        estimatedMinutes: 60,
      },
    }),
    // API Integration tasks
    prisma.task.create({
      data: {
        id: '00000000-0000-0000-0002-000000000006',
        userId: user.id,
        projectId: projectApi.id,
        title: 'Review API PR',
        description: 'Review and approve the partner API integration PR before standup.',
        status: 'todo',
        priority: 'high',
        dueDate: daysFromNow(0, 11, 30),
        estimatedMinutes: 20,
      },
    }),
    prisma.task.create({
      data: {
        id: '00000000-0000-0000-0002-000000000007',
        userId: user.id,
        projectId: projectApi.id,
        title: 'Send API credentials',
        description: 'Send staging API credentials to partner team via secure channel.',
        status: 'todo',
        priority: 'medium',
        dueDate: daysFromNow(0, 16, 0),
        estimatedMinutes: 10,
      },
    }),
    // Website Redesign tasks
    prisma.task.create({
      data: {
        id: '00000000-0000-0000-0002-000000000008',
        userId: user.id,
        projectId: projectWebsite.id,
        title: 'Review homepage design mockup',
        description: 'Review Figma mockup from design team and leave feedback.',
        status: 'in_progress',
        priority: 'medium',
        dueDate: daysFromNow(1, 17, 0),
        estimatedMinutes: 30,
      },
    }),
    prisma.task.create({
      data: {
        id: '00000000-0000-0000-0002-000000000009',
        userId: user.id,
        projectId: projectWebsite.id,
        title: 'Approve copy for hero section',
        description: 'Final approval needed on headline and subheadline copy.',
        status: 'completed',
        priority: 'medium',
        dueDate: daysFromNow(-1, 17, 0),
        estimatedMinutes: 15,
        completedAt: daysFromNow(-1, 14, 30),
      },
    }),
  ]);

  console.info(`✓  Created ${tasks.length} tasks`);

  // ── Calendar Events ───────────────────────────────────────
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const events = await Promise.all([
    // TODAY's events
    prisma.calendarEvent.create({
      data: {
        id: '00000000-0000-0000-0003-000000000001',
        userId: user.id,
        title: 'Team Standup',
        description: 'Daily engineering standup.',
        start: daysFromNow(0, 9, 30),
        end: daysFromNow(0, 9, 50),
        type: 'meeting',
        location: 'Zoom',
      },
    }),
    prisma.calendarEvent.create({
      data: {
        id: '00000000-0000-0000-0003-000000000002',
        userId: user.id,
        title: 'Product Meeting',
        description: 'Weekly product sync with PM and design.',
        start: daysFromNow(0, 11, 0),
        end: daysFromNow(0, 12, 0),
        type: 'meeting',
        location: 'Conference Room B',
        projectId: projectLaunch.id,
      },
    }),
    prisma.calendarEvent.create({
      data: {
        id: '00000000-0000-0000-0003-000000000003',
        userId: user.id,
        title: 'Lunch',
        description: '',
        start: daysFromNow(0, 12, 30),
        end: daysFromNow(0, 13, 30),
        type: 'break',
      },
    }),
    prisma.calendarEvent.create({
      data: {
        id: '00000000-0000-0000-0003-000000000004',
        userId: user.id,
        title: 'Design Review',
        description: 'Website redesign design review with UX team.',
        start: daysFromNow(0, 15, 0),
        end: daysFromNow(0, 16, 0),
        type: 'meeting',
        projectId: projectWebsite.id,
      },
    }),
    prisma.calendarEvent.create({
      data: {
        id: '00000000-0000-0000-0003-000000000005',
        userId: user.id,
        title: 'Demo Practice',
        description: "Practice run for tomorrow's product demo.",
        start: daysFromNow(0, 18, 30),
        end: daysFromNow(0, 19, 0),
        type: 'focus',
        projectId: projectLaunch.id,
      },
    }),
    // TOMORROW's events
    prisma.calendarEvent.create({
      data: {
        id: '00000000-0000-0000-0003-000000000006',
        userId: user.id,
        title: 'Product Demo',
        description: 'Live product demo for investors and key stakeholders. Must run under 20 min.',
        start: daysFromNow(1, 10, 0),
        end: daysFromNow(1, 11, 0),
        type: 'meeting',
        location: 'Main Conference Room',
        projectId: projectLaunch.id,
      },
    }),
    prisma.calendarEvent.create({
      data: {
        id: '00000000-0000-0000-0003-000000000007',
        userId: user.id,
        title: 'Team Standup',
        description: 'Daily engineering standup.',
        start: daysFromNow(1, 9, 30),
        end: daysFromNow(1, 9, 50),
        type: 'meeting',
        location: 'Zoom',
      },
    }),
    // This week's events
    prisma.calendarEvent.create({
      data: {
        id: '00000000-0000-0000-0003-000000000008',
        userId: user.id,
        title: 'Sprint Planning',
        description: 'Q4 sprint planning and story estimation.',
        start: daysFromNow(2, 10, 0),
        end: daysFromNow(2, 11, 30),
        type: 'meeting',
      },
    }),
  ]);

  console.info(`✓  Created ${events.length} calendar events`);

  // ── Initial Agent Session (shows previous usage) ──────────
  const session = await prisma.agentSession.create({
    data: {
      id: '00000000-0000-0000-0004-000000000001',
      userId: user.id,
      goal: 'Review what needs to be done before end of week.',
      status: 'completed',
      plan: {
        summary: 'Focus on API PR review and design feedback today, prep slides tomorrow morning.',
        items: [],
      },
    },
  });

  await prisma.agentAction.createMany({
    data: [
      {
        sessionId: session.id,
        tool: 'get_tasks',
        input: { status: 'todo', limit: 20 },
        output: { total: 7 },
        status: 'success',
        message: 'Retrieved 7 open tasks',
        latencyMs: 142,
      },
      {
        sessionId: session.id,
        tool: 'get_schedule',
        input: { startDate: 'today', endDate: '+7d' },
        output: { totalEvents: 6 },
        status: 'success',
        message: "Retrieved this week's schedule",
        latencyMs: 98,
      },
      {
        sessionId: session.id,
        tool: 'analyze_day',
        input: {},
        output: { focusScore: 62, urgentTasks: 2 },
        status: 'success',
        message: 'Analyzed today — 2 urgent tasks, moderate load',
        latencyMs: 310,
      },
    ],
  });

  console.info('✓  Created demo agent session with action log');

  console.info('');
  console.info('✅  Seed complete!');
  console.info('');
  console.info('Demo credentials:');
  console.info('  Email: alex.chen@lifeos.demo');
  console.info('  Demo mode: enabled (no password required)');
  console.info('');
  console.info('Projects:', 3);
  console.info('Tasks:', tasks.length);
  console.info('Events:', events.length);
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .then(
    () => prisma.$disconnect(),
    () => prisma.$disconnect(),
  );
