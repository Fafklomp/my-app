ALTER TABLE newsletters
  ADD COLUMN IF NOT EXISTS coming_up_next jsonb DEFAULT '[]';
