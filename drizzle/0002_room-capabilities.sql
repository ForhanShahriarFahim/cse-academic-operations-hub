ALTER TABLE "courses" ADD COLUMN "required_room_capability" text;--> statement-breakpoint
ALTER TABLE "rooms" ADD COLUMN "capabilities" jsonb DEFAULT '[]'::jsonb NOT NULL;
--> statement-breakpoint
UPDATE "rooms" SET "capabilities" = '["theory"]'::jsonb WHERE "room_type" = 'classroom';
--> statement-breakpoint
UPDATE "rooms" SET "capabilities" = '["computer", "theory"]'::jsonb WHERE "code" IN ('406', '407', '408');
--> statement-breakpoint
UPDATE "rooms" SET "capabilities" = '["microprocessor", "networking", "theory"]'::jsonb WHERE "code" = '505';
--> statement-breakpoint
UPDATE "rooms" SET "capabilities" = '["computer", "theory"]'::jsonb WHERE "room_type" = 'lab' AND "capabilities" = '[]'::jsonb;
--> statement-breakpoint
UPDATE "courses" SET "required_room_capability" = 'computer' WHERE "course_type" = 'sessional';
