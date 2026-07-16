-- Adds email-confirmation (signup) and weekly goal-progress-digest
-- subscription support to users. Idempotent -- safe to run multiple times.
--
-- email_verified defaults to TRUE at the column level so this ALTER doesn't
-- retroactively lock out any account that already existed before this
-- feature shipped (they signed up back when there was no confirmation step
-- at all). New local signups explicitly INSERT email_verified = false and
-- go through the confirmation flow; Google/ORCID signups explicitly INSERT
-- true, since the provider has already confirmed the email/identity.
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT true;

-- Same SHA-256-hash-of-token + expiry pattern as reset_token_hash /
-- reset_token_expires above -- never store the raw token, only its hash, so
-- a DB leak alone can't be used to confirm someone else's account.
ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_token_hash VARCHAR(64);
ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_token_expires TIMESTAMPTZ;

-- Opt-in (default true) weekly "how close are you to your goal" email --
-- see services/digestScheduler.js. Only ever sent to email_verified = true
-- accounts (see getDigestSubscribers in store.js) so this can't be used to
-- spam an address nobody has confirmed control of.
ALTER TABLE users ADD COLUMN IF NOT EXISTS digest_subscribed BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_users_digest_subscribed ON users(digest_subscribed) WHERE digest_subscribed = true;
