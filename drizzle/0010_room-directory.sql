-- ROM-01A: fail before changing legacy values; never repair institutional facts implicitly.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM rooms GROUP BY upper(btrim(code)) HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'ROM-01A preflight: duplicate canonical room codes; resolve with the owner before migrating';
  END IF;
  IF EXISTS (SELECT 1 FROM rooms WHERE btrim(code) = '' OR btrim(building) = '' OR room_type NOT IN ('classroom', 'lab') OR capacity <= 0) THEN
    RAISE EXCEPTION 'ROM-01A preflight: invalid room code, building, type or capacity; resolve with the owner before migrating';
  END IF;
END $$;
--> statement-breakpoint
ALTER TABLE rooms ADD COLUMN revision integer DEFAULT 1 NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX rooms_code_canonical_uq ON rooms (upper(btrim(code)));
--> statement-breakpoint
ALTER TABLE rooms ADD CONSTRAINT rooms_code_nonblank_ck CHECK (btrim(code) <> ''),
  ADD CONSTRAINT rooms_building_nonblank_ck CHECK (btrim(building) <> ''),
  ADD CONSTRAINT rooms_type_ck CHECK (room_type IN ('classroom', 'lab')),
  ADD CONSTRAINT rooms_capacity_ck CHECK (capacity IS NULL OR capacity > 0),
  ADD CONSTRAINT rooms_revision_ck CHECK (revision > 0);
