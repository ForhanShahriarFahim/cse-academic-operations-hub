UPDATE "rooms"
SET "capabilities" = '["computer", "microprocessor", "networking", "theory"]'::jsonb,
    "notes" = 'Computer laboratory equipped for specialist microprocessor and networking work; theory classes may use it when free.'
WHERE "code" = '505';
