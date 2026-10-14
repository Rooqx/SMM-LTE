-- Run with: psql "$DATABASE_URL" -v auth_role=YOUR_NEON_AUTH_ROLE -f backend/scripts/grant-auth-role.sql
-- Create the role with a distinct password in Neon first. Re-run these grants
-- after any migration that adds an auth-owned table.
GRANT USAGE ON SCHEMA public TO :"auth_role";
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  public."user", public."session", public.account, public.verification,
  public.jwks, public."rateLimit"
TO :"auth_role";
GRANT INSERT ON TABLE public.job_queue TO :"auth_role";
