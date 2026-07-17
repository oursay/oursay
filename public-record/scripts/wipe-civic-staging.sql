-- Civic / public-record wipe for staging (preserve auth + identity).
--
-- Truncates posts/comments/reactions (via record_tx), settlement outbox, anchor tips,
-- and civic projections. Does NOT touch:
--   users, thread_*, device_keys, jurisdiction_master_keys,
--   kyc_attestations, nullifier_attestations, auth.*, geo.*
--
-- After this SQL, also reset immudb (append-only — drop the volume), then redeploy.
-- See docs/temp/BLOCK-HEIGHT-HANDOFF.md for full compose commands.
--
-- Usage (Ubuntu/bash, repo root, compose project `oursay`):
--   docker exec -i oursay-public-record-pg psql -U oursay -d oursay_public_record \
--     < public-record/scripts/wipe-civic-staging.sql

BEGIN;
TRUNCATE
  mention_index,
  mention_map,
  share_marks,
  record_action_geo,
  entity_audience,
  anchor_publish_cursor,
  record_outbox,
  record_tx
CASCADE;
COMMIT;
