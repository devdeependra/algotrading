-- user_roles_and_audit_log
-- Phase 1b. Roles, approval workflow, and the audit log from spec §8.
--
-- role:   superadmin | admin | member. Exactly one superadmin, bound to
--         SUPERADMIN_EMAIL in config; enforced in code, not here.
-- status: pending   - registered, awaiting approval; may log in, nothing else
--         active    - approved
--         suspended - was active, blocked from logging in
--         rejected  - never approved, blocked from logging in

ALTER TABLE users
  ADD COLUMN role        TEXT        NOT NULL DEFAULT 'member'
    CHECK (role IN ('superadmin', 'admin', 'member')),
  ADD COLUMN status      TEXT        NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'active', 'suspended', 'rejected')),
  ADD COLUMN approved_by UUID        REFERENCES users (id) ON DELETE SET NULL,
  ADD COLUMN approved_at TIMESTAMPTZ,
  ADD COLUMN updated_at  TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE INDEX users_status_idx ON users (status, created_at);

-- Who did what to which entity. before/after hold the public shape of the
-- entity, never credentials.
CREATE TABLE audit_log (
  id          BIGSERIAL   PRIMARY KEY,
  actor_id    UUID        REFERENCES users (id) ON DELETE SET NULL,
  action      TEXT        NOT NULL,
  entity_type TEXT        NOT NULL,
  entity_id   TEXT        NOT NULL,
  before      JSONB,
  after       JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX audit_log_entity_idx ON audit_log (entity_type, entity_id, created_at);
CREATE INDEX audit_log_actor_idx  ON audit_log (actor_id, created_at);
