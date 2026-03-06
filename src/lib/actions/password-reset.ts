'use server';

import { createClient } from '@/lib/supabase/server';
import crypto from 'crypto';

// Helper function to generate 6-digit code
function generateVerificationCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// Helper function to hash token
function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

// Helper function to send SMS (placeholder - integrate with SMS provider)
async function sendSMS(phone: string, code: string): Promise<boolean> {
  // TODO: Integrate with SMS provider (Africa's Talking, Twilio, etc.)
  console.log(`📱 SMS to ${phone}: Your verification code is ${code}. Valid for 15 minutes.`);

  // For development, log the code
  console.log(`[DEV] Verification code for ${phone}: ${code}`);

  // Return true for now (in production, return actual SMS send status)
  return true;
}

interface RequestResetResponse {
  success: boolean;
  message: string;
  token?: string; // Only for development/testing
}

/**
 * Step 1: Request password reset
 * Generates a verification code and sends it via SMS
 */
export async function requestPasswordReset(phone: string): Promise<RequestResetResponse> {
  try {
    const supabase = await createClient();

    // Clean phone number (remove spaces, dashes)
    const cleanPhone = phone.replace(/[\s-]/g, '');

    // Validate phone format (Kenyan format: +254... or 07...)
    const phoneRegex = /^(\+254|0)[17]\d{8}$/;
    if (!phoneRegex.test(cleanPhone)) {
      return {
        success: false,
        message: 'Invalid phone number format. Use format: 0712345678 or +254712345678',
      };
    }

    // Normalize to +254 format
    let normalizedPhone = cleanPhone;
    if (cleanPhone.startsWith('0')) {
      normalizedPhone = '+254' + cleanPhone.substring(1);
    }

    // Check if user exists with this phone number
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, phone, email')
      .eq('phone', normalizedPhone)
      .single();

    // Always return success message to prevent phone enumeration
    const successMessage = 'If a user exists with this phone number, a verification code has been sent.';

    if (profileError || !profile) {
      // Don't reveal that user doesn't exist
      return {
        success: true,
        message: successMessage,
      };
    }

    // Rate limiting: Check if a recent request was made (within 1 minute)
    const oneMinuteAgo = new Date(Date.now() - 60 * 1000).toISOString();
    const { data: recentTokens } = await supabase
      .from('password_reset_tokens')
      .select('created_at')
      .eq('phone', normalizedPhone)
      .gte('created_at', oneMinuteAgo)
      .order('created_at', { ascending: false })
      .limit(1);

    if (recentTokens && recentTokens.length > 0) {
      return {
        success: false,
        message: 'Please wait 1 minute before requesting another code.',
      };
    }

    // Generate verification code and token
    const code = generateVerificationCode();
    const token = crypto.randomBytes(32).toString('hex'); // 64 character token
    const tokenHash = hashToken(token);
    const tokenExpiry = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    // Store in database
    const { error: insertError } = await supabase
      .from('password_reset_tokens')
      .insert({
        user_id: profile.id,
        phone: normalizedPhone,
        token_hash: tokenHash,
        code: code,
        token_expiry: tokenExpiry.toISOString(),
        used: false,
      });

    if (insertError) {
      console.error('Error storing reset token:', insertError);
      return {
        success: false,
        message: 'Failed to process request. Please try again.',
      };
    }

    // Send SMS
    const smsSent = await sendSMS(normalizedPhone, code);

    if (!smsSent) {
      // Clean up token if SMS failed
      await supabase
        .from('password_reset_tokens')
        .delete()
        .eq('token_hash', tokenHash);

      return {
        success: false,
        message: 'Failed to send SMS. Please try again.',
      };
    }

    // In development, return the token for testing
    if (process.env.NODE_ENV === 'development') {
      return {
        success: true,
        message: successMessage,
        token: token, // Only in development
      };
    }

    return {
      success: true,
      message: successMessage,
    };
  } catch (error) {
    console.error('Error in requestPasswordReset:', error);
    return {
      success: false,
      message: 'An error occurred. Please try again.',
    };
  }
}

interface VerifyCodeResponse {
  success: boolean;
  message: string;
  resetToken?: string;
}

/**
 * Step 2: Verify the SMS code
 * Validates the code and returns a reset token if valid
 */
export async function verifyResetCode(phone: string, code: string): Promise<VerifyCodeResponse> {
  try {
    const supabase = await createClient();

    // Clean phone number
    const cleanPhone = phone.replace(/[\s-]/g, '');
    let normalizedPhone = cleanPhone;
    if (cleanPhone.startsWith('0')) {
      normalizedPhone = '+254' + cleanPhone.substring(1);
    }

    // Validate code format (6 digits)
    if (!/^\d{6}$/.test(code)) {
      return {
        success: false,
        message: 'Invalid code format. Code must be 6 digits.',
      };
    }

    // Find valid token
    const { data: tokens, error: tokensError } = await supabase
      .from('password_reset_tokens')
      .select('*')
      .eq('phone', normalizedPhone)
      .eq('code', code)
      .eq('used', false)
      .gt('token_expiry', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(1);

    if (tokensError || !tokens || tokens.length === 0) {
      return {
        success: false,
        message: 'Invalid or expired verification code.',
      };
    }

    const tokenData = tokens[0];

    // Generate a new token for password reset
    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetTokenHash = hashToken(resetToken);

    // Update the token to mark as verified and store reset token hash
    const { error: updateError } = await supabase
      .from('password_reset_tokens')
      .update({
        token_hash: resetTokenHash,
      })
      .eq('id', tokenData.id);

    if (updateError) {
      console.error('Error updating token:', updateError);
      return {
        success: false,
        message: 'Failed to verify code. Please try again.',
      };
    }

    return {
      success: true,
      message: 'Code verified successfully.',
      resetToken: resetToken,
    };
  } catch (error) {
    console.error('Error in verifyResetCode:', error);
    return {
      success: false,
      message: 'An error occurred. Please try again.',
    };
  }
}

interface ResetPasswordResponse {
  success: boolean;
  message: string;
}

/**
 * Step 3: Reset password with verified token
 * Updates the user's password after successful verification
 */
export async function resetPassword(
  resetToken: string,
  newPassword: string
): Promise<ResetPasswordResponse> {
  try {
    const supabase = await createClient();

    // Validate password strength
    if (newPassword.length < 6) {
      return {
        success: false,
        message: 'Password must be at least 6 characters long.',
      };
    }

    // Hash the reset token
    const tokenHash = hashToken(resetToken);

    // Find the token and verify it's valid
    const { data: tokens, error: tokensError } = await supabase
      .from('password_reset_tokens')
      .select('*')
      .eq('token_hash', tokenHash)
      .eq('used', false)
      .gt('token_expiry', new Date().toISOString())
      .limit(1);

    if (tokensError || !tokens || tokens.length === 0) {
      return {
        success: false,
        message: 'Invalid or expired reset token.',
      };
    }

    const tokenData = tokens[0];

    // Update the password using Supabase Admin API
    const { error: updateError } = await supabase.auth.admin.updateUserById(
      tokenData.user_id,
      { password: newPassword }
    );

    if (updateError) {
      console.error('Error updating password:', updateError);
      return {
        success: false,
        message: 'Failed to update password. Please try again.',
      };
    }

    // Mark token as used and delete all other tokens for this user
    await supabase
      .from('password_reset_tokens')
      .delete()
      .eq('user_id', tokenData.user_id);

    return {
      success: true,
      message: 'Password reset successfully. You can now login with your new password.',
    };
  } catch (error) {
    console.error('Error in resetPassword:', error);
    return {
      success: false,
      message: 'An error occurred. Please try again.',
    };
  }
}
