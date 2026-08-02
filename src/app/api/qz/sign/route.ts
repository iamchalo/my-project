import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

export async function POST(req: NextRequest) {
  try {
    const privateKey = process.env.QZ_PRIVATE_KEY;
    if (!privateKey) {
      return NextResponse.json({ error: 'QZ signing key not configured.' }, { status: 500 });
    }

    const body = await req.json().catch(() => ({}));
    const request = body?.request ?? '';

    const sign = crypto.createSign('RSA-SHA512');
    sign.update(request);
    sign.end();
    const signature = sign.sign(privateKey, 'base64');

    return NextResponse.json({ signature });
  } catch (err) {
    console.error('[qz/sign]', err);
    return NextResponse.json({ error: 'Failed to sign request.' }, { status: 500 });
  }
}
