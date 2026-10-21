import { prisma } from '@lifeos/database';

async function testMove() {
  console.log('Testing: Move my practice session to 8 PM...');
  
  // 1. Get initial event state for Alex Chen
  const demoUserId = '00000000-0000-0000-0000-000000000001';
  const initialEvent = await prisma.calendarEvent.findFirst({
    where: {
      userId: demoUserId,
      title: { contains: 'Practice', mode: 'insensitive' },
    },
  });
  console.log('Initial event:', initialEvent?.title, 'start:', initialEvent?.start.toISOString());

  // 2. Call /api/agent/chat
  const res = await fetch('http://localhost:3000/api/agent/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ goal: 'Move my practice session to 8 PM.' }),
  });
  
  if (!res.ok) {
    throw new Error(`Chat failed: ${res.status} ${await res.text()}`);
  }
  const { sessionId } = await res.json() as { sessionId: string };
  console.log('Agent session started:', sessionId);

  // 3. Listen to SSE stream
  const sseRes = await fetch(`http://localhost:3000/api/agent/stream/${sessionId}`, {
    headers: { Accept: 'text/event-stream' },
  });
  const reader = sseRes.body!.getReader();
  const decoder = new TextDecoder();
  let done = false;
  let buffer = '';

  while (!done) {
    const chunk = await reader.read();
    if (chunk.done) break;
    buffer += decoder.decode(chunk.value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      if (line.startsWith('data:')) {
        const text = line.slice(5).trim();
        if (!text) continue;
        const ev = JSON.parse(text);
        console.log(`SSE: [${ev.type}] tool=${ev.tool ?? ''} msg=${ev.message ?? ev.summary ?? ''}`);
        if (ev.type === 'session_complete' || ev.type === 'session_error') {
          done = true;
          break;
        }
      }
    }
  }

  // 4. Check PostgreSQL after execution
  const updatedEvent = await prisma.calendarEvent.findFirst({
    where: {
      userId: demoUserId,
      title: { contains: 'Practice', mode: 'insensitive' },
    },
  });
  console.log('Updated event:', updatedEvent?.title, 'start:', updatedEvent?.start.toISOString());
  
  // Format in user's timezone (America/Los_Angeles)
  const user = await prisma.user.findUnique({ where: { id: demoUserId } });
  const tz = user?.timezone ?? 'America/Los_Angeles';
  const localTime = updatedEvent?.start.toLocaleTimeString('en-US', { timeZone: tz, hour: 'numeric', minute: '2-digit' });
  console.log(`Local start time in ${tz}: ${localTime}`);
}

testMove().catch(console.error);
