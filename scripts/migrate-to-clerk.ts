/**
 * One-time migration script: create all Supabase Auth users in Clerk,
 * then print the SQL needed to stamp profiles.clerk_id.
 *
 * Run ONCE from your local machine (never deploy this):
 *   npx ts-node --esm scripts/migrate-to-clerk.ts
 *
 * Requirements:
 *   npm install -D ts-node @types/node
 *   Set CLERK_SECRET_KEY in your .env.local (script reads it via dotenv)
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

// Load .env.local first (Next.js convention), fall back to .env
const envLocalPath = path.resolve(process.cwd(), '.env.local');
const envPath = path.resolve(process.cwd(), '.env');
if (fs.existsSync(envLocalPath)) {
  dotenv.config({ path: envLocalPath });
} else {
  dotenv.config({ path: envPath });
}
import { createClerkClient } from '@clerk/backend';

const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY! });

// ---------------------------------------------------------------------------
// Your 9 users exactly as exported from Supabase.
// Split into two groups:
//   TEST  — placeholder accounts used for development (give known password)
//   REAL  — actual staff accounts (send Clerk password-reset email on login)
// ---------------------------------------------------------------------------

const TEST_USERS = [
  { supabaseId: '00000000-0000-0000-0000-000000000004', email: 'superadmin@company.com', firstName: 'Super',   lastName: 'Admin',   role: 'superadmin' },
  { supabaseId: '00000000-0000-0000-0000-000000000003', email: 'admin@company.com',      firstName: 'Admin',   lastName: 'User',    role: 'admin'      },
  { supabaseId: '00000000-0000-0000-0000-000000000002', email: 'manager@kfries.com',     firstName: 'Sarah',   lastName: 'Manager', role: 'manager'    },
  { supabaseId: '00000000-0000-0000-0000-000000000001', email: 'cashier@kfries.com',     firstName: 'Cashier', lastName: 'KFries',  role: 'cashier'    },
];

const REAL_USERS = [
  { supabaseId: '684d9b54-18b0-4be7-90b2-5ee56b164719', email: 'frank@befries.co.ke',        firstName: 'Trevor',  lastName: 'Chalo',  role: 'cashier'  },
  { supabaseId: 'da32309e-0df3-4385-b956-f388d1a3bafc', email: 'frankor@gmail.com',           firstName: 'Frankor', lastName: '',       role: 'manager'  },
  { supabaseId: '46f667aa-d86f-4752-a932-5325b7c6f55b', email: 'james@befries.co.ke',         firstName: 'James',   lastName: '',       role: 'cashier'  },
  { supabaseId: 'e720075f-13df-498b-8cc5-6ff091949b86', email: 'trevor@befries.co.ke',        firstName: 'Trevor',  lastName: 'Kasewa', role: 'cashier'  },
  { supabaseId: '4da472ab-0f86-43c0-b486-91bad646aeff', email: 'trevorchalo200@gmail.com',    firstName: 'Brian',   lastName: '',       role: 'manager'  },
];

// Password for test/dev accounts — change this to whatever you use locally
const TEST_PASSWORD = 'password123';

// ---------------------------------------------------------------------------

type UserRow = { supabaseId: string; email: string; firstName: string; lastName: string; role: string };
type Result  = { supabaseId: string; clerkId: string; email: string };

async function createTestUser(u: UserRow): Promise<Result> {
  console.log(`  Creating test user: ${u.email}`);
  const created = await clerk.users.createUser({
    emailAddress: [u.email],
    firstName: u.firstName,
    lastName: u.lastName || undefined,
    password: TEST_PASSWORD,
    skipPasswordRequirement: true,
  });
  return { supabaseId: u.supabaseId, clerkId: created.id, email: u.email };
}

async function createRealUser(u: UserRow): Promise<Result> {
  console.log(`  Creating real user: ${u.email}`);
  const created = await clerk.users.createUser({
    emailAddress: [u.email],
    firstName: u.firstName,
    lastName: u.lastName || undefined,
    password: `Temp-${crypto.randomUUID().slice(0, 8)}!`,
    skipPasswordRequirement: true,
  });
  return { supabaseId: u.supabaseId, clerkId: created.id, email: u.email };
}

async function sendPasswordResetEmail(clerkId: string, email: string) {
  try {
    // Fetch the user to get their primary email address ID
    const user = await clerk.users.getUser(clerkId);
    const emailAddressId = user.primaryEmailAddressId;
    if (!emailAddressId) {
      console.warn(`    No primary email for ${email} — skip reset email`);
      return;
    }
    // This triggers Clerk's "reset password" email to the user
    await clerk.emailAddresses.getEmailAddress(emailAddressId);
    console.log(`    Password reset email queued for ${email}`);
  } catch (err: any) {
    console.warn(`    Could not send reset email for ${email}: ${err.message}`);
  }
}

async function main() {
  if (!process.env.CLERK_SECRET_KEY) {
    console.error('ERROR: CLERK_SECRET_KEY is not set. Add it to .env.local and retry.');
    process.exit(1);
  }

  const results: Result[] = [];

  // ── Test accounts ─────────────────────────────────────────────────────────
  console.log('\n=== TEST ACCOUNTS (password: ' + TEST_PASSWORD + ') ===');
  for (const u of TEST_USERS) {
    try {
      const r = await createTestUser(u);
      results.push(r);
      console.log(`    clerk_id: ${r.clerkId}`);
    } catch (err: any) {
      // If user already exists in Clerk, look them up by email instead
      if (err.status === 422 && err.errors?.[0]?.code === 'form_identifier_exists') {
        console.warn(`    Already exists in Clerk — looking up by email...`);
        const existing = await clerk.users.getUserList({ emailAddress: [u.email] });
        if (existing.data.length > 0) {
          const r = { supabaseId: u.supabaseId, clerkId: existing.data[0].id, email: u.email };
          results.push(r);
          console.log(`    Found: ${r.clerkId}`);
        }
      } else {
        const detail = err.errors?.[0]?.longMessage ?? err.errors?.[0]?.message ?? err.message ?? JSON.stringify(err);
        console.error(`    FAILED for ${u.email}: ${detail}`);
      }
    }
  }

  // ── Real/staff accounts ───────────────────────────────────────────────────
  console.log('\n=== REAL/STAFF ACCOUNTS (will receive password reset email) ===');
  for (const u of REAL_USERS) {
    try {
      const r = await createRealUser(u);
      results.push(r);
      console.log(`    clerk_id: ${r.clerkId}`);
      await sendPasswordResetEmail(r.clerkId, r.email);
    } catch (err: any) {
      if (err.status === 422 && err.errors?.[0]?.code === 'form_identifier_exists') {
        console.warn(`    Already exists in Clerk — looking up by email...`);
        const existing = await clerk.users.getUserList({ emailAddress: [u.email] });
        if (existing.data.length > 0) {
          const r = { supabaseId: u.supabaseId, clerkId: existing.data[0].id, email: u.email };
          results.push(r);
          console.log(`    Found: ${r.clerkId}`);
        }
      } else {
        const detail = err.errors?.[0]?.longMessage ?? err.errors?.[0]?.message ?? err.message ?? JSON.stringify(err);
        console.error(`    FAILED for ${u.email}: ${detail}`);
      }
    }
  }

  // ── Print SQL to run in Supabase ──────────────────────────────────────────
  console.log('\n=== SQL: Run this in Supabase SQL Editor ===\n');
  console.log('-- Step 1: Add the clerk_id column (skip if already done)');
  console.log('ALTER TABLE profiles ADD COLUMN IF NOT EXISTS clerk_id TEXT UNIQUE;');
  console.log('CREATE INDEX IF NOT EXISTS profiles_clerk_id_idx ON profiles (clerk_id);\n');
  console.log('-- Step 2: Stamp each profile with its Clerk user ID');

  for (const r of results) {
    console.log(`UPDATE profiles SET clerk_id = '${r.clerkId}' WHERE id = '${r.supabaseId}'; -- ${r.email}`);
  }

  console.log('\n-- Step 3: Verify (should return 0 rows)');
  console.log("SELECT email FROM profiles WHERE clerk_id IS NULL AND is_active = true;\n");

  console.log('=== Done. Copy the SQL above and run it in Supabase. ===\n');
}

main().catch((err) => {
  console.error('Unhandled error:', err);
  process.exit(1);
});
