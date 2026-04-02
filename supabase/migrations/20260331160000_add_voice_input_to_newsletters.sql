-- Add voice_input column to newsletters
-- Stores the user's raw transcribed/typed description of their month.
-- Used as input context when AI generates per-audience summaries.

alter table newsletters
  add column voice_input text;
