ALTER TABLE organizations
  DROP CONSTRAINT IF EXISTS organizations_slug_check;

ALTER TABLE organizations
  ADD CONSTRAINT organizations_slug_check
  CHECK (slug ~ '^[a-z0-9]([a-z0-9-]{0,62}[a-z0-9])?$');
