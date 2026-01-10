-- Migration script to convert timestamp from TIMESTAMP to BIGINT (Unix seconds)
-- Run this if you have existing data with TIMESTAMP format

-- Step 1: Add new column for Unix timestamp
ALTER TABLE blocks ADD COLUMN IF NOT EXISTS timestamp_unix BIGINT;

-- Step 2: Convert existing TIMESTAMP to Unix seconds
UPDATE blocks 
SET timestamp_unix = EXTRACT(EPOCH FROM timestamp)::BIGINT
WHERE timestamp_unix IS NULL;

-- Step 3: Drop old timestamp column
ALTER TABLE blocks DROP COLUMN IF EXISTS timestamp;

-- Step 4: Rename new column to timestamp
ALTER TABLE blocks RENAME COLUMN timestamp_unix TO timestamp;

-- Step 5: Make it NOT NULL
ALTER TABLE blocks ALTER COLUMN timestamp SET NOT NULL;

