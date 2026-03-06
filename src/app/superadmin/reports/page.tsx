'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
export default function SuperadminReportsRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace('/superadmin/inventory'); }, []);
  return null;
}
