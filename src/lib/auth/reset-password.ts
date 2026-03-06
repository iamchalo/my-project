'use server';

import { createAdminClient } from '@/lib/supabase/admin';

const TOKEN_EXPIRY_MS    = 15 * 60 * 1000; // 15 minutes
const MAX_PER_HOUR       = 5;

// ─── Crypto helpers ────────────────────────────────────────────────────────────

/** Generate a 32-byte cryptographically secure random hex token. */
export async function generateRawToken(): Promise<string> {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

/** SHA-256 hash of a raw token → 64-char hex string. */
export async function hashToken(raw: string): Promise<string> {
  const data = new TextEncoder().encode(raw);
  const buf  = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// ─── Rate limit ────────────────────────────────────────────────────────────────

/** Returns true if the user is under the rate limit. */
export async function isUnderRateLimit(userId: string): Promise<boolean> {
  const supabase   = createAdminClient();
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

  const { count } = await supabase
    .from('password_reset_tokens')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('created_at', oneHourAgo);

  return (count ?? 0) < MAX_PER_HOUR;
}

// ─── Token lifecycle ───────────────────────────────────────────────────────────

/**
 * Invalidates all existing active tokens for the user, then creates a fresh
 * hashed token.  Returns the raw (unhashed) token to embed in the email URL.
 */
export async function createResetToken(userId: string): Promise<string> {
  const supabase = createAdminClient();

  // Invalidate any existing unused tokens
  await supabase
    .from('password_reset_tokens')
    .update({ used: true })
    .eq('user_id', userId)
    .eq('used', false);

  const raw       = await generateRawToken();
  const tokenHash = await hashToken(raw);
  const expiresAt = new Date(Date.now() + TOKEN_EXPIRY_MS).toISOString();

  const { error } = await supabase.from('password_reset_tokens').insert({
    user_id:    userId,
    token_hash: tokenHash,
    expires_at: expiresAt,
    used:       false,
  });

  if (error) throw new Error(`Token creation failed: ${error.message}`);
  return raw;
}

/**
 * Validates a raw token.
 * Returns { valid: true, userId } on success or { valid: false, error } on failure.
 */
export async function validateResetToken(
  raw: string
): Promise<{ valid: boolean; userId?: string; tokenId?: string; error?: string }> {
  const supabase  = createAdminClient();
  const tokenHash = await hashToken(raw);

  const { data, error } = await supabase
    .from('password_reset_tokens')
    .select('id, user_id, expires_at, used')
    .eq('token_hash', tokenHash)
    .single();

  if (error || !data) return { valid: false, error: 'Invalid or expired reset link.' };
  if (data.used)       return { valid: false, error: 'This reset link has already been used.' };
  if (new Date(data.expires_at) < new Date())
    return { valid: false, error: 'This reset link has expired (links are valid for 15 minutes).' };

  return { valid: true, userId: data.user_id, tokenId: data.id };
}

/**
 * Marks the used token and invalidates all other tokens for the same user.
 * Call only after password update succeeds.
 */
export async function consumeResetToken(raw: string, userId: string): Promise<void> {
  const supabase  = createAdminClient();
  const tokenHash = await hashToken(raw);

  await supabase
    .from('password_reset_tokens')
    .update({ used: true })
    .eq('token_hash', tokenHash);

  // Invalidate any remaining tokens for the user
  await supabase
    .from('password_reset_tokens')
    .update({ used: true })
    .eq('user_id', userId)
    .eq('used', false);
}
