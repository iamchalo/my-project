import { NextRequest, NextResponse } from 'next/server';
import { auth, clerkClient } from '@clerk/nextjs/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function DELETE(req: NextRequest) {
  try {
    // 1. Verify caller via Clerk
    const { userId: callerClerkId } = await auth();
    if (!callerClerkId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 2. Confirm caller is superadmin (check DB, not just client state)
    const supabase = createAdminClient();
    const { data: callerProfile } = await supabase
      .from('profiles')
      .select('role')
      .eq('clerk_id', callerClerkId)
      .maybeSingle();

    if (callerProfile?.role !== 'superadmin') {
      return NextResponse.json({ error: 'Forbidden: only superadmins can delete users' }, { status: 403 });
    }

    // 3. Parse target
    const body = await req.json().catch(() => ({}));
    const { userId: targetClerkId } = body ?? {};

    if (!targetClerkId || typeof targetClerkId !== 'string') {
      return NextResponse.json({ error: 'userId (Clerk ID) is required' }, { status: 400 });
    }

    // 4. Prevent self-deletion
    if (targetClerkId === callerClerkId) {
      return NextResponse.json({ error: 'You cannot delete your own account' }, { status: 400 });
    }

    // 5. Delete profile row from Supabase
    await supabase.from('profiles').delete().eq('clerk_id', targetClerkId);

    // 6. Delete from Clerk (invalidates all sessions automatically)
    const clerk = await clerkClient();
    await clerk.users.deleteUser(targetClerkId);

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('[delete-user]', err);
    return NextResponse.json({ error: 'Failed to delete user. Please try again.' }, { status: 500 });
  }
}
