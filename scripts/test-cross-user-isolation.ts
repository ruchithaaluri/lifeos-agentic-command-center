import { prisma } from '@lifeos/database';

async function runIsolationTest() {
  console.log('====================================================');
  console.log('TESTING CROSS-USER ISOLATION');
  console.log('====================================================');

  const randomSuffix = Math.random().toString(36).substring(7);
  const aliceEmail = `alice.${randomSuffix}@lifeos.local`;
  const bobEmail = `bob.${randomSuffix}@lifeos.local`;
  const password = 'StrongPassword123!';

  // 1. Create Alice via Signup API
  console.log('\n[1] Creating User Alice via /api/auth/signup...');
  const aliceSignupRes = await fetch('http://localhost:3000/api/auth/signup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: aliceEmail,
      password,
      name: 'Alice Smith',
      timezone: 'America/New_York',
    }),
  });
  if (!aliceSignupRes.ok) {
    throw new Error(`Alice signup failed: ${aliceSignupRes.status} ${await aliceSignupRes.text()}`);
  }
  const alice = await aliceSignupRes.json() as { id: string; email: string };

  // Alice creates a private task and event
  const aliceTask = await prisma.task.create({
    data: {
      userId: alice.id,
      title: 'Alice Top Secret Plan',
      priority: 'urgent',
      status: 'todo',
    },
  });

  const aliceEvent = await prisma.calendarEvent.create({
    data: {
      userId: alice.id,
      title: 'Alice Confidential Board Meeting',
      start: new Date('2026-10-21T18:00:00Z'),
      end: new Date('2026-10-21T19:00:00Z'),
    },
  });
  console.log(`✓ Alice created with task "${aliceTask.title}" and event "${aliceEvent.title}"`);

  // 2. Create Bob via Signup API
  console.log('\n[2] Creating User Bob via /api/auth/signup...');
  const bobSignupRes = await fetch('http://localhost:3000/api/auth/signup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: bobEmail,
      password,
      name: 'Bob Jones',
    }),
  });
  if (!bobSignupRes.ok) {
    throw new Error(`Bob signup failed: ${bobSignupRes.status} ${await bobSignupRes.text()}`);
  }
  const bob = await bobSignupRes.json() as { id: string; email: string };

  // Bob logs in via NextAuth credentials endpoint
  console.log('\n[3] Authenticating as Bob...');
  const csrfRes = await fetch('http://localhost:3000/api/auth/csrf');
  const { csrfToken } = (await csrfRes.json()) as { csrfToken: string };
  const rawCookieHeader = csrfRes.headers.get('set-cookie') || '';
  const initialCookies = rawCookieHeader.split(',').map((c) => c.split(';')[0].trim()).join('; ');

  const signInRes = await fetch('http://localhost:3000/api/auth/callback/credentials', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Cookie: initialCookies,
    },
    body: new URLSearchParams({
      csrfToken,
      email: bobEmail,
      password,
    }).toString(),
    redirect: 'manual',
  });

  const bobCookies = (signInRes.headers.get('set-cookie') || '')
    .split(',')
    .map((c) => c.split(';')[0].trim())
    .join('; ');

  if (!bobCookies.includes('next-auth.session-token')) {
    throw new Error('Failed to obtain session token for Bob');
  }
  console.log('✓ Bob authenticated successfully');

  // 4. Bob queries tasks and events
  console.log('\n[4] Bob queries tasks and events...');
  const bobTasksRes = await fetch('http://localhost:3000/api/tasks', {
    headers: { Cookie: bobCookies },
  });
  const bobTasksData = await bobTasksRes.json() as { tasks: Array<{ id: string; title: string }> };

  const bobEventsRes = await fetch('http://localhost:3000/api/events', {
    headers: { Cookie: bobCookies },
  });
  const bobEventsData = await bobEventsRes.json() as { events: Array<{ id: string; title: string }> };

  // Check that Bob CANNOT see Alice's data
  const canSeeAliceTask = bobTasksData.tasks.some((t) => t.id === aliceTask.id || t.title.includes('Alice'));
  const canSeeAliceEvent = bobEventsData.events.some((e) => e.id === aliceEvent.id || e.title.includes('Alice'));

  if (canSeeAliceTask || canSeeAliceEvent) {
    throw new Error(`SECURITY BREACH: Bob can see Alice's data! task=${canSeeAliceTask}, event=${canSeeAliceEvent}`);
  }
  console.log("✓ Bob cannot see Alice's tasks or events in API responses");

  // 5. Bob attempts unauthorized modification of Alice's task
  console.log("\n[5] Bob attempts unauthorized mutation of Alice's task...");
  const maliciousUpdateRes = await fetch(`http://localhost:3000/api/tasks`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Cookie: bobCookies,
    },
    body: JSON.stringify({
      id: aliceTask.id,
      title: 'Hacked by Bob',
    }),
  });

  // Verify Alice's task is still unchanged in DB
  const verifiedAliceTask = await prisma.task.findUnique({ where: { id: aliceTask.id } });
  if (verifiedAliceTask?.title !== 'Alice Top Secret Plan') {
    throw new Error("SECURITY BREACH: Bob mutated Alice's task!");
  }
  console.log("✓ Alice's task remained completely untouched in database (cross-user mutation prevented)");

  // 6. Test MCP tool scoping for Bob
  console.log('\n[6] Bob calls agent chat (which invokes MCP tools with signed identity)...');
  const agentRes = await fetch('http://localhost:3000/api/agent/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: bobCookies,
    },
    body: JSON.stringify({ goal: 'List my tasks and plan my day' }),
  });

  if (!agentRes.ok) {
    throw new Error(`Bob agent call failed: ${agentRes.status} ${await agentRes.text()}`);
  }
  const { sessionId: bobSessionId } = await agentRes.json() as { sessionId: string };

  // Listen to SSE to let it complete
  const sseRes = await fetch(`http://localhost:3000/api/agent/stream/${bobSessionId}`, {
    headers: { Accept: 'text/event-stream', Cookie: bobCookies },
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
        if (ev.type === 'session_complete' || ev.type === 'session_error') {
          done = true;
          break;
        }
      }
    }
  }

  // Verify Bob's agent session is strictly owned by Bob
  const bobSession = await prisma.agentSession.findUnique({
    where: { id: bobSessionId },
  });
  if (bobSession?.userId !== bob.id) {
    throw new Error(`SECURITY BREACH: Agent session userId is ${bobSession?.userId}, expected Bob's id ${bob.id}`);
  }
  console.log(`✓ Agent session correctly scoped to Bob's userId: ${bobSession.userId}`);

  // Verify Alice still only has her own sessions
  const aliceSessions = await prisma.agentSession.findMany({ where: { userId: alice.id } });
  if (aliceSessions.some((s) => s.id === bobSessionId)) {
    throw new Error("SECURITY BREACH: Bob's session leaked into Alice's account!");
  }
  console.log("✓ Zero session leakage between Alice and Bob");

  console.log('\n====================================================');
  console.log('CROSS-USER ISOLATION TEST PASSED FULLY!');
  console.log('====================================================');
}

runIsolationTest().catch((err) => {
  console.error('Cross-user isolation test failed:', err);
  process.exit(1);
});
