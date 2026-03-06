import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isUnderRateLimit, createResetToken } from '@/lib/auth/reset-password';
import { sendResetEmail } from '@/lib/email/send-reset-email';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const email = (body?.email ?? '').trim().toLowerCase();

    if (!email) {
      return NextResponse.json({ error: 'Email address is required.' }, { status: 400 });
    }

    const supabase = createAdminClient();

    // Look up user by email via profiles table (avoids expensive listUsers scan)
    const { data: profile } = await supabase
      .from('profiles')
      .select('id, full_name, email')
      .eq('email', email)
      .maybeSingle();

    // Always return success — never reveal whether the email exists
    if (!profile) {
      return NextResponse.json({ success: true });
    }

    // Rate limit: max 5 requests per hour per user
    const allowed = await isUnderRateLimit(profile.id);
    if (!allowed) {
      return NextResponse.json(
        { error: 'Too many reset requests. Please wait an hour before trying again.' },
        { status: 429 }
      );
    }

    // Create hashed token (invalidates old ones)
    const rawToken = await createResetToken(profile.id);

    // Build reset URL
    const appUrl    = process.env.NEXT_PUBLIC_APP_URL ?? req.nextUrl.origin;
    const resetLink = `${appUrl}/auth/reset-password?token=${rawToken}`;

    // Send email
    await sendResetEmail({
      toEmail:  profile.email,
      resetLink,
      userName: profile.full_name ?? undefined,
    });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('[request-reset]', err);
    return NextResponse.json(
      { error: 'Something went wrong. Please try again.' },
      { status: 500 }
    );
  }
}
