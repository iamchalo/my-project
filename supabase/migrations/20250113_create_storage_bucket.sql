-- =====================================================
-- CREATE STORAGE BUCKET FOR PRODUCT IMAGES
-- =====================================================
-- This migration creates a storage bucket for product images
-- with appropriate RLS policies for managers to upload images
-- and public read access for displaying images.
-- =====================================================

-- Create the storage bucket for product images
INSERT INTO storage.buckets (id, name, public)
VALUES ('product-images', 'product-images', true)
ON CONFLICT (id) DO NOTHING;

-- =====================================================
-- STORAGE RLS POLICIES
-- =====================================================

-- Policy 1: Allow managers to upload images to their branch folder
CREATE POLICY "managers_upload_branch_images"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'product-images' AND
  (storage.foldername(name))[1] IN (
    SELECT branch_id::text
    FROM profiles
    WHERE id = auth.uid()
    AND role = 'manager'
  )
);

-- Policy 2: Allow managers to update images in their branch folder
CREATE POLICY "managers_update_branch_images"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'product-images' AND
  (storage.foldername(name))[1] IN (
    SELECT branch_id::text
    FROM profiles
    WHERE id = auth.uid()
    AND role = 'manager'
  )
);

-- Policy 3: Allow managers to delete images in their branch folder
CREATE POLICY "managers_delete_branch_images"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'product-images' AND
  (storage.foldername(name))[1] IN (
    SELECT branch_id::text
    FROM profiles
    WHERE id = auth.uid()
    AND role = 'manager'
  )
);

-- Policy 4: Allow admins and superadmins full access
CREATE POLICY "admins_full_access_images"
ON storage.objects
FOR ALL
TO authenticated
USING (
  bucket_id = 'product-images' AND
  EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
    AND role IN ('admin', 'superadmin')
  )
);

-- Policy 5: Allow public read access (anyone can view images)
-- This is important for displaying product images on the frontend
CREATE POLICY "public_read_images"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'product-images');

-- =====================================================
-- STORAGE CONFIGURATION
-- =====================================================

-- Set file size limit to 5MB
UPDATE storage.buckets
SET
  file_size_limit = 5242880,  -- 5MB in bytes
  allowed_mime_types = ARRAY[
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
    'image/gif'
  ]
WHERE id = 'product-images';

-- =====================================================
-- VERIFICATION
-- =====================================================

-- Verify bucket was created
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'product-images') THEN
    RAISE NOTICE 'Storage bucket "product-images" created successfully';
    RAISE NOTICE 'Bucket is public: images are publicly accessible';
    RAISE NOTICE 'File size limit: 5MB';
    RAISE NOTICE 'Allowed types: JPEG, PNG, WEBP, GIF';
  ELSE
    RAISE WARNING 'Failed to create storage bucket';
  END IF;
END $$;

-- Display storage policies
SELECT
  policyname,
  cmd,
  CASE
    WHEN roles = '{public}' THEN 'Public'
    WHEN roles = '{authenticated}' THEN 'Authenticated Users'
    ELSE roles::text
  END as applies_to
FROM pg_policies
WHERE tablename = 'objects'
AND schemaname = 'storage'
AND policyname LIKE '%images%'
ORDER BY policyname;
