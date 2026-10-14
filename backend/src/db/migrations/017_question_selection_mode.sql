-- Existing questions keep their original single-choice contract. New model
-- questions explicitly declare when several suggestions can apply together.
ALTER TABLE pending_questions
  ADD COLUMN selection_mode text NOT NULL DEFAULT 'single'
  CHECK (selection_mode IN ('single', 'multiple'));
