-- SPDX-License-Identifier: Apache-2.0
-- Copyright (c) 2026 PeopleOS contributors

DROP TRIGGER IF EXISTS trg_leave_apply_balance ON leave_requests;
DROP FUNCTION IF EXISTS leave_apply_balance();
ALTER TABLE leave_balances DROP CONSTRAINT IF EXISTS leave_balances_used_within_entitled;
ALTER TABLE leave_balances DROP CONSTRAINT IF EXISTS leave_balances_non_negative;
