-- =====================================================
-- FIX PRODUCT FUNCTIONS SEARCH PATH
-- These functions need search_path = public to work correctly
-- =====================================================

-- Drop existing functions first to allow recreation with correct return types
DROP FUNCTION IF EXISTS public.get_branch_products(UUID);
DROP FUNCTION IF EXISTS public.get_products_with_branches();
DROP FUNCTION IF EXISTS public.assign_product_to_branch(UUID, UUID, DECIMAL, BOOLEAN);
DROP FUNCTION IF EXISTS public.toggle_branch_product(UUID, UUID);

-- Fix get_branch_products function
CREATE OR REPLACE FUNCTION public.get_branch_products(target_branch_id UUID)
RETURNS TABLE (
  id UUID,
  product_name TEXT,
  category TEXT,
  product_price DECIMAL,
  image_url TEXT,
  is_active BOOLEAN,
  stock_quantity INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.id,
    p.product_name,
    p.category,
    COALESCE(bp.local_price, p.base_price) as product_price,
    p.image_url,
    bp.is_active,
    bp.stock_quantity
  FROM public.products p
  INNER JOIN public.branch_products bp ON p.id = bp.product_id
  WHERE bp.branch_id = target_branch_id
    AND bp.is_active = true
  ORDER BY p.category, p.product_name;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Fix get_products_with_branches function
CREATE OR REPLACE FUNCTION public.get_products_with_branches()
RETURNS TABLE (
  product_id UUID,
  product_name TEXT,
  category TEXT,
  base_price DECIMAL,
  image_url TEXT,
  description TEXT,
  branches JSONB
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.id as product_id,
    p.product_name,
    p.category,
    p.base_price,
    p.image_url,
    p.description,
    COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'branch_id', b.id,
          'branch_name', b.name,
          'branch_code', b.code,
          'is_active', COALESCE(bp.is_active, false),
          'local_price', bp.local_price,
          'stock_quantity', COALESCE(bp.stock_quantity, 0),
          'has_assignment', bp.id IS NOT NULL
        )
        ORDER BY b.name
      ),
      '[]'::jsonb
    ) as branches
  FROM public.products p
  CROSS JOIN public.branches b
  LEFT JOIN public.branch_products bp ON p.id = bp.product_id AND b.id = bp.branch_id
  WHERE b.is_active = true
  GROUP BY p.id, p.product_name, p.category, p.base_price, p.image_url, p.description
  ORDER BY p.category, p.product_name;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Fix assign_product_to_branch function
CREATE OR REPLACE FUNCTION public.assign_product_to_branch(
  target_product_id UUID,
  target_branch_id UUID,
  price DECIMAL DEFAULT NULL,
  active BOOLEAN DEFAULT true
)
RETURNS VOID AS $$
BEGIN
  INSERT INTO public.branch_products (product_id, branch_id, local_price, is_active)
  VALUES (target_product_id, target_branch_id, price, active)
  ON CONFLICT (product_id, branch_id)
  DO UPDATE SET
    local_price = COALESCE(EXCLUDED.local_price, public.branch_products.local_price),
    is_active = EXCLUDED.is_active;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Fix toggle_branch_product function
CREATE OR REPLACE FUNCTION public.toggle_branch_product(
  target_product_id UUID,
  target_branch_id UUID
)
RETURNS BOOLEAN AS $$
DECLARE
  new_status BOOLEAN;
BEGIN
  UPDATE public.branch_products
  SET is_active = NOT is_active
  WHERE product_id = target_product_id AND branch_id = target_branch_id
  RETURNING is_active INTO new_status;

  RETURN new_status;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
