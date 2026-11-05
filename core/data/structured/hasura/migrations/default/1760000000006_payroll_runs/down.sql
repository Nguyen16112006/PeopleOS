-- SPDX-License-Identifier: Apache-2.0
-- Copyright (c) 2026 PeopleOS contributors

DROP TABLE IF EXISTS payslip_complaints CASCADE;
DROP TABLE IF EXISTS payroll_runs CASCADE;
-- View v_payroll_monthly giữ định nghĩa mới (chỉ tính bảng lương đã chi trả).
