import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { validateResetToken, consumeResetToken } from '@/lib/auth/reset-password';

const PASSWORD_REGEX_LETTER = /[a-zA-Z]/;
const PASSWORD_REGEX_NUMBER = /[0-9]/;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { token, password } = body ?? {};

    if (!token || typeof token !== 'string') {
      return NextResponse.json({ error: 'Reset token is missing.' }, { status: 400 });
    }
    if (!password || typeof password !== 'string') {
      return NextResponse.json({ error: 'Password is required.' }, { status: 400 });
    }

    // Password rules
    if (password.length < 8) {
      return NextResponse.json(
        { error: 'Password must be at least 8 characters long.' },
        { status: 400 }
      );
    }
    if (!PASSWORD_REGEX_LETTER.test(password) || !PASSWORD_REGEX_NUMBER.test(password)) {
      return NextResponse.json(
        { error: 'Password must include both letters and numbers.' },
        { status: 400 }
      );
    }

    // Validate token (checks expiry + used flag)
    const validation = await validateResetToken(token);
    if (!validation.valid) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    const supabase = createAdminClient();

    // Update password via admin client (bypasses session requirement)
    const { error: updateError } = await supabase.auth.admin.updateUserById(
      validation.userId!,
      { password }
    );
    if (updateError) throw updateError;

    // Mark token used + invalidate all other tokens for this user
    await consumeResetToken(token, validation.userId!);

    // Audit log
    await supabase.from('password_change_logs').insert({
      user_id:    validation.userId,
      event_type: 'success',
      ip_address: req.headers.get('x-forwarded-for') ?? null,
      user_agent: req.headers.get('user-agent') ?? null,
    });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('[reset-password]', err);
    return NextResponse.json(
      { error: 'Failed to reset password. Please request a new link.' },
      { status: 500 }
    );
  }
}
