import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

export async function DELETE(req: NextRequest) {
  try {
    // 1. Verify caller's session via cookie-based server client
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 2. Confirm caller is superadmin (double-check in DB, not just client state)
    const { data: callerProfile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .maybeSingle();

    if (callerProfile?.role !== 'superadmin') {
      return NextResponse.json(
        { error: 'Forbidden: only superadmins can delete users' },
        { status: 403 }
      );
    }

    // 3. Parse and validate target user ID
    const body = await req.json().catch(() => ({}));
    const { userId } = body ?? {};

    if (!userId || typeof userId !== 'string') {
      return NextResponse.json({ error: 'userId is required' }, { status: 400 });
    }

    // 4. Prevent self-deletion
    if (userId === user.id) {
      return NextResponse.json(
        { error: 'You cannot delete your own account' },
        { status: 400 }
      );
    }

    const adminClient = createAdminClient();

    // 5. Delete profile row first (handles tables without cascade)
    await adminClient.from('profiles').delete().eq('id', userId);

    // 6. Delete from Supabase Auth — permanently removes the user
    const { error: deleteError } = await adminClient.auth.admin.deleteUser(userId);
    if (deleteError) throw deleteError;

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('[delete-user]', err);
    return NextResponse.json(
      { error: 'Failed to delete user. Please try again.' },
      { status: 500 }
    );
  }
}
