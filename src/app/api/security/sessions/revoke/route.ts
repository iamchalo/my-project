import { NextRequest, NextResponse } from 'next/server';
import { auth, clerkClient } from '@clerk/nextjs/server';

export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const { sessionId } = body ?? {};
    if (!sessionId || typeof sessionId !== 'string') {
      return NextResponse.json({ error: 'sessionId is required' }, { status: 400 });
    }

    const clerk = await clerkClient();
    const session = await clerk.sessions.getSession(sessionId);

    if (session.userId !== userId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    await clerk.sessions.revokeSession(sessionId);

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('[security/sessions/revoke]', err);
    return NextResponse.json({ error: 'Failed to log out of that device' }, { status: 500 });
  }
}
