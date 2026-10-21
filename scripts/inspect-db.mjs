import { prisma } from '../packages/database/dist/index.js';

async function run() {
  const user = await prisma.user.findUnique({
    where: { id: '00000000-0000-0000-0000-000000000001' }
  });
  console.log('User timezone in DB:', user?.timezone);

  const events = await prisma.calendarEvent.findMany({
    where: { userId: '00000000-0000-0000-0000-000000000001' },
    orderBy: { start: 'asc' }
  });
  console.log('Events count in DB:', events.length);
  for (const e of events) {
    console.log(`- [${e.id}] "${e.title}" start: ${e.start.toISOString()} end: ${e.end.toISOString()} (${(e.end - e.start)/(1000*60)}m)`);
  }

  const sessions = await prisma.agentSession.findMany({
    where: { userId: '00000000-0000-0000-0000-000000000001' },
    orderBy: { createdAt: 'desc' },
    take: 2
  });
  for (const s of sessions) {
    console.log(`\nSession [${s.id}] goal: "${s.goal}" status: ${s.status}`);
    console.log('Plan:', JSON.stringify(s.plan, null, 2));
  }

  await prisma.$disconnect();
}

run().catch(console.error);
