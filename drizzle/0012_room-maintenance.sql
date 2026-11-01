CREATE TABLE room_unavailability (
  id serial PRIMARY KEY,
  room_id integer NOT NULL REFERENCES rooms(id),
  start_date date NOT NULL,
  end_date date NOT NULL,
  weekdays integer[] NOT NULL,
  start_minutes integer NOT NULL,
  end_minutes integer NOT NULL,
  reason text NOT NULL,
  cancelled boolean NOT NULL DEFAULT false,
  revision integer NOT NULL DEFAULT 1,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT room_unavailability_dates_ck CHECK (start_date >= DATE '0001-01-01' AND end_date <= DATE '9999-12-31' AND start_date <= end_date),
  CONSTRAINT room_unavailability_weekdays_ck CHECK (array_ndims(weekdays) = 1 AND array_lower(weekdays, 1) = 1 AND cardinality(weekdays) BETWEEN 1 AND 7 AND weekdays <@ ARRAY[0,1,2,3,4,5,6] AND array_position(weekdays, NULL) IS NULL AND cardinality(weekdays) = (CASE WHEN 0 = ANY(weekdays) THEN 1 ELSE 0 END + CASE WHEN 1 = ANY(weekdays) THEN 1 ELSE 0 END + CASE WHEN 2 = ANY(weekdays) THEN 1 ELSE 0 END + CASE WHEN 3 = ANY(weekdays) THEN 1 ELSE 0 END + CASE WHEN 4 = ANY(weekdays) THEN 1 ELSE 0 END + CASE WHEN 5 = ANY(weekdays) THEN 1 ELSE 0 END + CASE WHEN 6 = ANY(weekdays) THEN 1 ELSE 0 END)),
  CONSTRAINT room_unavailability_occurrence_ck CHECK ((0 = ANY(weekdays) AND ((0 - ((extract(isodow from start_date)::integer + 1) % 7) + 7) % 7) <= end_date - start_date) OR (1 = ANY(weekdays) AND ((1 - ((extract(isodow from start_date)::integer + 1) % 7) + 7) % 7) <= end_date - start_date) OR (2 = ANY(weekdays) AND ((2 - ((extract(isodow from start_date)::integer + 1) % 7) + 7) % 7) <= end_date - start_date) OR (3 = ANY(weekdays) AND ((3 - ((extract(isodow from start_date)::integer + 1) % 7) + 7) % 7) <= end_date - start_date) OR (4 = ANY(weekdays) AND ((4 - ((extract(isodow from start_date)::integer + 1) % 7) + 7) % 7) <= end_date - start_date) OR (5 = ANY(weekdays) AND ((5 - ((extract(isodow from start_date)::integer + 1) % 7) + 7) % 7) <= end_date - start_date) OR (6 = ANY(weekdays) AND ((6 - ((extract(isodow from start_date)::integer + 1) % 7) + 7) % 7) <= end_date - start_date)),
  CONSTRAINT room_unavailability_minutes_ck CHECK (0 <= start_minutes AND start_minutes < end_minutes AND end_minutes <= 1440),
  CONSTRAINT room_unavailability_reason_ck CHECK (char_length(btrim(reason)) >= 1 AND char_length(btrim(reason)) <= 300 AND reason = btrim(reason)),
  CONSTRAINT room_unavailability_revision_ck CHECK (revision > 0)
);
--> statement-breakpoint
CREATE INDEX room_unavailability_room_dates_idx ON room_unavailability (room_id, start_date, end_date);
