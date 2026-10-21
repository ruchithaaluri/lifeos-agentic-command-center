import { prisma } from '@lifeos/database';

async function main() {
  const tasks = await prisma.task.findMany({
    where: { title: { contains: 'practice', mode: 'insensitive' } },
  });
  console.log(`\nTASKS MATCHING "practice" (${tasks.length}):`);
  for (const t of tasks) {
    console.log(
      ` - User ${t.userId}: [${t.status}] "${t.title}" (id: ${t.id}, updated: ${t.updatedAt.toISOString()})`,
    );
  }

  const events = await prisma.calendarEvent.findMany({
    where: { title: { contains: 'practice', mode: 'insensitive' } },
  });
  console.log(`\nEVENTS MATCHING "practice" (${events.length}):`);
  for (const e of events) {
    console.log(
      ` - User ${e.userId}: "${e.title}" from ${e.start.toISOString()} to ${e.end.toISOString()} (id: ${e.id})`,
    );
  }

  // All events across all users for Oct 19 / Oct 20
  const octEvents = await prisma.calendarEvent.findMany({
    orderBy: { start: 'asc' },
  });
  console.log(`\nTOTAL CALENDAR EVENTS IN DB: ${octEvents.length}`);
  for (const e of octEvents) {
    console.log(
      ` - User ${e.userId}: "${e.title}" (${e.start.toISOString()} - ${e.end.toISOString()})`,
    );
  }
}

main().finally(() => prisma.$disconnect());
