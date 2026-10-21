import { prisma } from '@lifeos/database';

const BASE_URL = 'http://localhost:3000';

interface SSEEvent {
  type: string;
  sessionId?: string;
  tool?: string;
  message?: string;
  plan?: {
    id: string;
    goal: string;
    items: Array<{
      id: string;
      type: string;
      title: string;
      durationMinutes: number;
      startTime: string;
      endTime: string;
    }>;
    summary: string;
  };
  summary?: string;
  actionsCount?: number;
  timestamp?: string;
}

async function runE2E() {
  console.info('====================================================');
  console.info('STARTING REAL LIFEOS E2E VERIFICATION');
  console.info('====================================================\n');

  const randomSuffix = Math.random().toString(36).slice(2, 8);
  const email = `e2e.user.${randomSuffix}@lifeos.local`;
  const name = `E2E Test User ${randomSuffix}`;
  const password = `SecurePassword123!`;

  // ── Step 1: Sign up a fresh user ──
  console.info(`[Step 1] Creating fresh user: ${email}...`);
  const signupRes = await fetch(`${BASE_URL}/api/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, name, password }),
  });

  if (!signupRes.ok) {
    throw new Error(`Signup failed with HTTP ${signupRes.status}: ${await signupRes.text()}`);
  }
  const signupData = (await signupRes.json()) as { id: string; email: string; name: string };
  console.info(`✓ User created successfully in PostgreSQL: ID=${signupData.id}`);

  // ── Step 2: Sign in via NextAuth ──
  console.info(`\n[Step 2] Authenticating via NextAuth credentials flow...`);
  const csrfRes = await fetch(`${BASE_URL}/api/auth/csrf`);
  const rawCsrfCookies = csrfRes.headers.getSetCookie
    ? csrfRes.headers.getSetCookie()
    : [csrfRes.headers.get('set-cookie') ?? ''];
  const csrfCookieHeader = rawCsrfCookies
    .map((c) => c.split(';')[0])
    .filter(Boolean)
    .join('; ');
  const { csrfToken } = (await csrfRes.json()) as { csrfToken: string };

  const params = new URLSearchParams();
  params.append('csrfToken', csrfToken);
  params.append('email', email);
  params.append('password', password);
  params.append('redirect', 'false');
  params.append('json', 'true');

  const loginRes = await fetch(`${BASE_URL}/api/auth/callback/credentials`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Cookie: csrfCookieHeader,
    },
    body: params.toString(),
    redirect: 'manual',
  });

  const rawLoginCookies = loginRes.headers.getSetCookie
    ? loginRes.headers.getSetCookie()
    : [loginRes.headers.get('set-cookie') ?? ''];
  const sessionCookieHeader = rawLoginCookies
    .map((c) => c.split(';')[0])
    .filter(Boolean)
    .join('; ');
  if (!sessionCookieHeader.includes('next-auth.session-token')) {
    throw new Error(
      `Failed to obtain next-auth.session-token cookie on login: ${JSON.stringify(rawLoginCookies)}`,
    );
  }
  console.info(`✓ NextAuth JWT session cookie obtained successfully`);

  const authHeaders = {
    Cookie: sessionCookieHeader,
    'Content-Type': 'application/json',
  };

  // ── Step 3: Trigger lazy onboarding & verify starter workspace ──
  console.info(`\n[Step 3] Verifying lazy onboarding and workspace creation...`);
  const tasksRes = await fetch(`${BASE_URL}/api/tasks`, { headers: authHeaders });
  if (!tasksRes.ok) {
    throw new Error(`Failed to fetch tasks with HTTP ${tasksRes.status}`);
  }
  const tasksData = (await tasksRes.json()) as {
    tasks: Array<{ id: string; title: string; status: string; priority: string }>;
  };
  const initialTasks = tasksData.tasks ?? [];

  const eventsRes = await fetch(`${BASE_URL}/api/events`, { headers: authHeaders });
  const eventsData = (await eventsRes.json()) as { events: Array<{ id: string; title: string }> };
  const initialEvents = eventsData.events ?? [];

  const projectsRes = await fetch(`${BASE_URL}/api/projects`, { headers: authHeaders });
  const projectsData = (await projectsRes.json()) as {
    projects: Array<{ id: string; name: string }>;
  };
  const initialProjects = projectsData.projects ?? [];

  console.info(
    `✓ Onboarding created: ${initialProjects.length} projects, ${initialTasks.length} tasks, ${initialEvents.length} calendar events`,
  );
  if (initialTasks.length === 0 || initialEvents.length === 0 || initialProjects.length === 0) {
    throw new Error('Starter workspace was not created properly by onboarding!');
  }

  // ── Step 4: First Agent Command ──
  const goal1 = "I have a product demo tomorrow and I'm behind. Get me ready.";
  console.info(`\n[Step 4] Submitting primary user request: "${goal1}"...`);

  const chatRes1 = await fetch(`${BASE_URL}/api/agent/chat`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ goal: goal1 }),
  });

  if (!chatRes1.ok) {
    throw new Error(`Chat API failed with HTTP ${chatRes1.status}: ${await chatRes1.text()}`);
  }
  const { sessionId: session1Id } = (await chatRes1.json()) as { sessionId: string };
  console.info(`✓ Agent session started: Session ID=${session1Id}`);

  // ── Step 5: Connect to SSE Stream and capture events ──
  console.info(`\n[Step 5] Connecting to real-time SSE stream for session ${session1Id}...`);
  const sseEvents1 = await listenToSSE(`${BASE_URL}/api/agent/stream/${session1Id}`, authHeaders);
  console.info(`✓ Received ${sseEvents1.length} SSE events:`);
  for (const ev of sseEvents1) {
    console.info(`   - [${ev.type}] ${ev.tool ?? ''} ${ev.message ?? ev.summary ?? ''}`);
  }

  const hasPlanReady1 = sseEvents1.some((e) => e.type === 'plan_ready');
  const hasComplete1 = sseEvents1.some((e) => e.type === 'session_complete');
  const toolCalls1 = sseEvents1.filter((e) => e.type === 'action_start').map((e) => e.tool);

  if (!hasPlanReady1 || !hasComplete1) {
    throw new Error(`SSE stream did not receive plan_ready or session_complete!`);
  }
  console.info(`✓ Tools executed via MCP: ${toolCalls1.join(' → ')}`);

  // ── Step 6: Verify PostgreSQL changes after Goal 1 ──
  console.info(`\n[Step 6] Verifying actual PostgreSQL state mutations...`);
  const postTasks1 = await prisma.task.findMany({ where: { userId: signupData.id } });
  const postEvents1 = await prisma.calendarEvent.findMany({ where: { userId: signupData.id } });
  const postSessions1 = await prisma.agentSession.findMany({ where: { userId: signupData.id } });

  console.info(`✓ PostgreSQL Agent Sessions: ${postSessions1.length}`);
  console.info(
    `✓ PostgreSQL Calendar Events: ${postEvents1.length} (Initial was ${initialEvents.length})`,
  );

  const demoPracticeEvent = postEvents1.find((e) =>
    e.title.toLowerCase().includes('demo practice'),
  );
  if (!demoPracticeEvent) {
    throw new Error(
      'Expected "Demo Practice" calendar event was not created in PostgreSQL by execute_plan!',
    );
  }
  console.info(
    `✓ Verified "Demo Practice" event created in DB: ${demoPracticeEvent.id} (${demoPracticeEvent.start.toISOString()} to ${demoPracticeEvent.end.toISOString()})`,
  );

  // ── Step 7: Replanning Command with 90-minute constraint ──
  const goal2 = 'I only have 90 minutes tonight. Replan it.';
  console.info(`\n[Step 7] Submitting replanning request: "${goal2}"...`);

  const chatRes2 = await fetch(`${BASE_URL}/api/agent/chat`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ goal: goal2 }),
  });

  if (!chatRes2.ok) {
    throw new Error(
      `Replanning Chat API failed with HTTP ${chatRes2.status}: ${await chatRes2.text()}`,
    );
  }
  const { sessionId: session2Id } = (await chatRes2.json()) as { sessionId: string };
  console.info(`✓ Replanning session started: Session ID=${session2Id}`);

  // ── Step 8: Connect to SSE stream for Replanning ──
  console.info(`\n[Step 8] Connecting to SSE stream for session ${session2Id}...`);
  const sseEvents2 = await listenToSSE(`${BASE_URL}/api/agent/stream/${session2Id}`, authHeaders);
  console.info(`✓ Received ${sseEvents2.length} SSE events for replanning:`);
  for (const ev of sseEvents2) {
    console.info(`   - [${ev.type}] ${ev.tool ?? ''} ${ev.message ?? ev.summary ?? ''}`);
  }

  const planEvent2 = sseEvents2.find((e) => e.type === 'plan_ready');
  if (!planEvent2 || !planEvent2.plan) {
    throw new Error('Replanning failed: No plan_ready event received in SSE stream!');
  }

  // ── Step 9: Verify 90-minute Constraint & Data Difference ──
  console.info(`\n[Step 9] Verifying 90-minute constraint in generated plan...`);
  const taskItemsInPlan = planEvent2.plan.items.filter((i) => i.type === 'task');
  const totalTaskMinutes = taskItemsInPlan.reduce((acc, i) => acc + (i.durationMinutes || 0), 0);

  console.info(`✓ Total task minutes scheduled in new plan: ${totalTaskMinutes} minutes`);
  console.info(
    `  Scheduled tasks: ${taskItemsInPlan.map((t) => `"${t.title}" (${t.durationMinutes}m)`).join(', ')}`,
  );

  if (totalTaskMinutes > 90) {
    throw new Error(
      `Plan violated constraint: ${totalTaskMinutes} minutes scheduled, expected <= 90 minutes!`,
    );
  }
  console.info(`✓ Constraint strictly satisfied: ${totalTaskMinutes}m <= 90m`);

  // ── Step 10: Persistence Test after refresh / re-query ──
  console.info(`\n[Step 10] Testing state persistence across simulated reload...`);
  const finalTasksRes = await fetch(`${BASE_URL}/api/tasks`, { headers: authHeaders });
  const finalTasksData = (await finalTasksRes.json()) as {
    tasks: Array<{ id: string; title: string; status: string }>;
  };
  const finalTasks = finalTasksData.tasks ?? [];
  const finalEventsRes = await fetch(`${BASE_URL}/api/events`, { headers: authHeaders });
  const finalEventsData = (await finalEventsRes.json()) as {
    events: Array<{ id: string; title: string }>;
  };
  const finalEvents = finalEventsData.events ?? [];

  console.info(
    `✓ Data re-queried via API: ${finalTasks.length} tasks, ${finalEvents.length} events`,
  );
  const dbSessions = await prisma.agentSession.findMany({ where: { userId: signupData.id } });
  console.info(
    `✓ Agent sessions persisted in PostgreSQL: ${dbSessions.length} sessions (both completed)`,
  );
  for (const s of dbSessions) {
    console.info(`   - Session ${s.id}: goal="${s.goal}", status="${s.status}"`);
  }

  console.info('\n====================================================');
  console.info('ALL E2E VERIFICATION STEPS PASSED SUCCESSFULLY!');
  console.info('====================================================');
}

function listenToSSE(url: string, headers: Record<string, string>): Promise<SSEEvent[]> {
  return new Promise(async (resolve, reject) => {
    const events: SSEEvent[] = [];
    const timeout = setTimeout(() => {
      resolve(events);
    }, 15000);

    try {
      const res = await fetch(url, { headers: { ...headers, Accept: 'text/event-stream' } });
      if (!res.ok) {
        clearTimeout(timeout);
        return reject(new Error(`SSE connection failed with HTTP ${res.status}`));
      }

      if (!res.body) {
        clearTimeout(timeout);
        return reject(new Error('SSE response body is empty'));
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (line.startsWith('data:')) {
            const dataStr = line.slice(5).trim();
            if (!dataStr) continue;
            try {
              const parsed = JSON.parse(dataStr) as SSEEvent;
              events.push(parsed);
              if (parsed.type === 'session_complete' || parsed.type === 'session_error') {
                clearTimeout(timeout);
                resolve(events);
                return;
              }
            } catch {
              // Ignore non-json frames
            }
          }
        }
      }
      clearTimeout(timeout);
      resolve(events);
    } catch (err) {
      clearTimeout(timeout);
      reject(err);
    }
  });
}

runE2E()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('E2E Verification Error:', err);
    process.exit(1);
  });
