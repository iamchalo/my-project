import { NextResponse } from 'next/server';
import { auth, clerkClient } from '@clerk/nextjs/server';

export async function POST() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const clerk = await clerkClient();
    const { data: sessions } = await clerk.sessions.getSessionList({ userId, status: 'active' });

    await Promise.all(sessions.map((s) => clerk.sessions.revokeSession(s.id).catch(() => null)));

    return NextResponse.json({ success: true, revoked: sessions.length });
  } catch (err: any) {
    console.error('[security/sessions/revoke-all]', err);
    return NextResponse.json({ error: 'Failed to log out of all devices' }, { status: 500 });
  }
}
