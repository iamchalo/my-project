'use server';

import { createAdminClient } from '@/lib/supabase/admin';

export async function uploadProductImage(formData: FormData): Promise<{ url: string } | { error: string }> {
  const file = formData.get('file') as File | null;
  if (!file) return { error: 'No file provided' };

  const fileExt = file.name.split('.').pop();
  const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;

  const supabase = createAdminClient();
  const { error } = await supabase.storage
    .from('product-images')
    .upload(fileName, file, { cacheControl: '3600', upsert: false });

  if (error) return { error: error.message };

  const { data } = supabase.storage.from('product-images').getPublicUrl(fileName);
  return { url: data.publicUrl };
}
