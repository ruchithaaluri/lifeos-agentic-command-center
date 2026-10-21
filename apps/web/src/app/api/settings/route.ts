import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@lifeos/database';
import { requireUserId, serverError } from '@/lib/api-guard';
import { isDemoMode } from '@/lib/server-auth';

export const dynamic = 'force-dynamic';

const UpdateSettingsSchema = z.object({
  timezone: z.string().trim().min(1).max(100).optional(),
  name: z.string().trim().min(1).max(100).optional(),
});

export async function GET() {
  const guard = await requireUserId();
  if ('response' in guard) return guard.response;

  try {
    const user = await prisma.user.findUnique({
      where: { id: guard.userId },
      select: {
        id: true,
        name: true,
        email: true,
        timezone: true,
      },
    });

    const demoMode = isDemoMode();
    const aiProvider = process.env['AI_PROVIDER'] ?? 'openai';
    const aiModel = process.env['AI_MODEL'] ?? 'gpt-4o';
    const mcpServerUrl = process.env['MCP_SERVER_URL'] ?? 'http://localhost:3001';

    return NextResponse.json({
      user: user ?? {
        id: guard.userId,
        name: 'LifeOS User',
        email: '',
        timezone: 'America/Los_Angeles',
      },
      mode: {
        demoMode,
        label: demoMode ? 'Demo Mode' : 'Strict Authentication Mode',
      },
      ai: {
        provider: aiProvider,
        model: aiModel,
      },
      mcp: {
        url: mcpServerUrl,
        status: 'configured',
      },
    });
  } catch (err) {
    console.error('api/settings GET failed', {
      message: err instanceof Error ? err.message : 'unknown',
    });
    return serverError('Loading settings');
  }
}

export async function PATCH(req: NextRequest) {
  const guard = await requireUserId();
  if ('response' in guard) return guard.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: 'Invalid JSON body' } },
      { status: 400 },
    );
  }

  const parsed = UpdateSettingsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          code: 'VALIDATION_ERROR',
          message: parsed.error.issues[0]?.message ?? 'Invalid settings data',
        },
      },
      { status: 400 },
    );
  }

  const data = parsed.data;
  const updateData: Record<string, unknown> = {};

  if (data.timezone !== undefined) {
    // Validate timezone string validity
    try {
      new Intl.DateTimeFormat(undefined, { timeZone: data.timezone });
      updateData['timezone'] = data.timezone;
    } catch {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: `Invalid timezone: "${data.timezone}".` } },
        { status: 400 },
      );
    }
  }

  if (data.name !== undefined) {
    updateData['name'] = data.name;
  }

  if (Object.keys(updateData).length === 0) {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: 'No valid fields to update.' } },
      { status: 400 },
    );
  }

  try {
    const updated = await prisma.user.update({
      where: { id: guard.userId },
      data: updateData,
      select: {
        id: true,
        name: true,
        email: true,
        timezone: true,
      },
    });

    return NextResponse.json({
      user: updated,
      message: 'Settings updated successfully.',
    });
  } catch (err) {
    console.error('api/settings PATCH failed', {
      message: err instanceof Error ? err.message : 'unknown',
    });
    return serverError('Updating settings');
  }
}
