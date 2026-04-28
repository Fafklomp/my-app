-- Prevent duplicate newsletters for the same user + month.
-- period_start is always set to the first day of a month, so a unique index on
-- (user_id, date_trunc('month', period_start)) enforces one newsletter per month.
CREATE UNIQUE INDEX IF NOT EXISTS newsletters_user_month_unique
  ON newsletters (user_id, date_trunc('month', period_start AT TIME ZONE 'UTC'))
  WHERE period_start IS NOT NULL;
