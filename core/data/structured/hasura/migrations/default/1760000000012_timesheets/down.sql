-- SPDX-License-Identifier: Apache-2.0
-- Copyright (c) 2026 PeopleOS contributors

ALTER TABLE payrolls
  DROP COLUMN IF EXISTS standard_days,
  DROP COLUMN IF EXISTS paid_days,
  DROP COLUMN IF EXISTS overtime_hours;
DROP TABLE IF EXISTS timesheets CASCADE;
DROP TABLE IF EXISTS attendance_records CASCADE;
