import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

/**
 * GET /api/settings
 * Return all app settings as a key-value object.
 */
export async function GET() {
  try {
    const settings = await prisma.appSetting.findMany();
    const result: Record<string, string> = {};
    for (const s of settings) {
      result[s.key] = s.value;
    }

    // Defaults
    if (!result.google_auto_resolve_enabled) {
      result.google_auto_resolve_enabled = 'true';
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error('Settings error:', error);
    return NextResponse.json({ error: 'Failed to load settings' }, { status: 500 });
  }
}

/**
 * PATCH /api/settings
 * Update one or more settings.
 * Body: { key: value, ... }
 */
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json() as Record<string, string>;

    for (const [key, value] of Object.entries(body)) {
      await prisma.appSetting.upsert({
        where: { key },
        update: { value: String(value), updatedAt: new Date() },
        create: { key, value: String(value) },
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Settings update error:', error);
    return NextResponse.json({ error: 'Failed to update settings' }, { status: 500 });
  }
}
