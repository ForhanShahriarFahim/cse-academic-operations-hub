-- Existing and imported rooms are retained. Only portal creation explicitly opts into draft status.
ALTER TABLE rooms ADD COLUMN is_draft boolean DEFAULT false NOT NULL;
