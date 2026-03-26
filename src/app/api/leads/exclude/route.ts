import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { businessIds, excluded } = body;

    if (!Array.isArray(businessIds) || businessIds.length === 0) {
      return NextResponse.json({ error: 'businessIds array is required' }, { status: 400 });
    }

    if (typeof excluded !== 'boolean') {
      return NextResponse.json({ error: 'excluded must be a boolean' }, { status: 400 });
    }

    const result = await prisma.business.updateMany({
      where: { id: { in: businessIds } },
      data: {
        excluded,
        excludedAt: excluded ? new Date() : null,
      },
    });

    return NextResponse.json({
      updated: result.count,
      excluded,
    });
  } catch (error) {
    console.error('Exclude error:', error);
    return NextResponse.json({ error: 'Failed to update exclusion status' }, { status: 500 });
  }
}
