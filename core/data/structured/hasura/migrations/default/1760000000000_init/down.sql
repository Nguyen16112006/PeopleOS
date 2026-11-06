-- SPDX-License-Identifier: Apache-2.0
-- Copyright (c) 2026 PeopleOS contributors

DROP TABLE IF EXISTS notifications, onboarding_tasks, approval_steps, salary_proposals,
  leave_requests, leave_balances, insurance_records, payrolls, contracts, employees, users CASCADE;
DROP FUNCTION IF EXISTS set_updated_at();
