import { NextResponse } from 'next/server';
import { auth, clerkClient } from '@clerk/nextjs/server';

export async function GET() {
  try {
    const { userId, sessionId: currentSessionId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const clerk = await clerkClient();

    // The Backend API paginates session lists (default page size is small),
    // so page through everything to make sure no logins are hidden.
    const pageSize = 100;
    const sessions: Awaited<ReturnType<typeof clerk.sessions.getSessionList>>['data'] = [];
    let offset = 0;
    while (true) {
      const { data, totalCount } = await clerk.sessions.getSessionList({ userId, limit: pageSize, offset });
      sessions.push(...data);
      offset += data.length;
      if (data.length === 0 || offset >= totalCount) break;
    }

    const result = sessions
      .sort((a, b) => b.lastActiveAt - a.lastActiveAt)
      .map((s) => ({
        id: s.id,
        isCurrent: s.id === currentSessionId,
        status: s.status,
        lastActiveAt: s.lastActiveAt,
        createdAt: s.createdAt,
        browserName: s.latestActivity?.browserName ?? null,
        deviceType: s.latestActivity?.deviceType ?? null,
        isMobile: s.latestActivity?.isMobile ?? false,
        city: s.latestActivity?.city ?? null,
        country: s.latestActivity?.country ?? null,
        ipAddress: s.latestActivity?.ipAddress ?? null,
      }));

    return NextResponse.json({ sessions: result });
  } catch (err: any) {
    console.error('[security/sessions]', err);
    return NextResponse.json({ error: 'Failed to load sessions' }, { status: 500 });
  }
}
