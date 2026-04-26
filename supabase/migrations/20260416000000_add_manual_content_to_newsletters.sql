ALTER TABLE newsletters
  ADD COLUMN IF NOT EXISTS manual_content jsonb DEFAULT '{}';
