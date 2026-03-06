-- =====================================================
-- FIX FUNCTION SEARCH PATH SECURITY WARNING
-- =====================================================
-- Setting search_path = '' prevents search path manipulation attacks
-- where malicious actors could create functions in other schemas
-- that get called instead of the intended ones.
-- =====================================================

-- =====================================================
-- BRANCHES AND USERS FUNCTIONS
-- =====================================================
ALTER FUNCTION public.update_updated_at_column() SET search_path = '';
-- handle_new_user needs public schema access for profiles table
ALTER FUNCTION public.handle_new_user() SET search_path = public;
ALTER FUNCTION public.get_user_role(UUID) SET search_path = '';
ALTER FUNCTION public.get_user_branch(UUID) SET search_path = '';
ALTER FUNCTION public.can_access_branch(UUID, UUID) SET search_path = '';

-- =====================================================
-- JWT/ROLE FUNCTIONS
-- =====================================================
ALTER FUNCTION public.get_my_role() SET search_path = '';
ALTER FUNCTION public.get_my_branch() SET search_path = '';

-- =====================================================
-- PRODUCTS FUNCTIONS
-- =====================================================
ALTER FUNCTION public.get_active_products_by_branch(UUID) SET search_path = '';
ALTER FUNCTION public.toggle_product_status(UUID) SET search_path = '';
ALTER FUNCTION public.get_branch_products(UUID) SET search_path = '';
ALTER FUNCTION public.get_products_with_branches() SET search_path = '';
ALTER FUNCTION public.assign_product_to_branch(UUID, UUID, DECIMAL, BOOLEAN) SET search_path = '';
ALTER FUNCTION public.toggle_branch_product(UUID, UUID) SET search_path = '';

-- =====================================================
-- EXPENSES FUNCTIONS
-- =====================================================
ALTER FUNCTION public.generate_expense_number() SET search_path = '';
ALTER FUNCTION public.get_expenses_by_branch_and_date(UUID, DATE) SET search_path = '';
ALTER FUNCTION public.get_daily_expense_total(UUID, DATE) SET search_path = '';
ALTER FUNCTION public.get_expenses_by_branch_date_shift(UUID, DATE, TEXT) SET search_path = '';

-- =====================================================
-- ORDERS FUNCTIONS
-- =====================================================
ALTER FUNCTION public.generate_order_number() SET search_path = '';
ALTER FUNCTION public.get_orders_by_branch(UUID, TIMESTAMP WITH TIME ZONE, TIMESTAMP WITH TIME ZONE) SET search_path = '';
ALTER FUNCTION public.get_order_details(UUID) SET search_path = '';
ALTER FUNCTION public.archive_old_orders(INTEGER) SET search_path = '';
ALTER FUNCTION public.get_orders_storage_stats() SET search_path = '';

-- =====================================================
-- SHIFTS FUNCTIONS
-- =====================================================
ALTER FUNCTION public.generate_shift_number() SET search_path = '';
ALTER FUNCTION public.get_last_shift_cash(UUID) SET search_path = '';
-- Note: get_today_expense_total not applied - function may not exist
ALTER FUNCTION public.determine_shift_type(TIMESTAMP WITH TIME ZONE) SET search_path = '';
ALTER FUNCTION public.start_shift(UUID, UUID) SET search_path = '';
ALTER FUNCTION public.end_shift(UUID, DECIMAL, TEXT) SET search_path = '';
ALTER FUNCTION public.get_active_shift(UUID) SET search_path = '';
ALTER FUNCTION public.get_shift_history(UUID, DATE, DATE, INTEGER) SET search_path = '';
ALTER FUNCTION public.get_current_shift() SET search_path = '';

-- =====================================================
-- TIMEZONE FUNCTIONS
-- =====================================================
ALTER FUNCTION public.get_kenya_date() SET search_path = '';
ALTER FUNCTION public.get_kenya_timestamp() SET search_path = '';

-- =====================================================
-- SUMMARY/ARCHIVE FUNCTIONS
-- =====================================================
ALTER FUNCTION public.generate_daily_summary(UUID, DATE, shift_type_enum) SET search_path = '';
ALTER FUNCTION public.generate_monthly_summary(UUID, DATE) SET search_path = '';
ALTER FUNCTION public.archive_old_data(DATE, BOOLEAN) SET search_path = '';

-- =====================================================
-- COMMENTS
-- =====================================================
COMMENT ON FUNCTION public.update_updated_at_column IS 'Trigger function to auto-update updated_at column. search_path secured.';
COMMENT ON FUNCTION public.handle_new_user IS 'Creates profile when new auth user is created. search_path secured.';
