-- Hoàn tác migration 6 vai trò (chuyển director/accountant về chuỗi cũ).
DROP TABLE IF EXISTS temp_access_requests CASCADE;
DROP FUNCTION IF EXISTS temp_access_no_self_approval();
DROP TABLE IF EXISTS advance_requests CASCADE;
DROP TABLE IF EXISTS approval_events CASCADE;
DROP TABLE IF EXISTS app_settings CASCADE;

ALTER TABLE leave_requests DROP COLUMN IF EXISTS hr_adjusted_at;
ALTER TABLE leave_requests DROP COLUMN IF EXISTS stage;

-- Bỏ bước kế toán, đưa director về step 2 và approver_role 'admin'
DELETE FROM approval_steps WHERE approver_role = 'accountant';
UPDATE approval_steps SET step_order = 2 WHERE approver_role = 'director';
ALTER TABLE approval_steps DROP CONSTRAINT IF EXISTS approval_steps_approver_role_check;
UPDATE approval_steps SET approver_role = 'admin' WHERE approver_role = 'director';
ALTER TABLE approval_steps ADD CONSTRAINT approval_steps_approver_role_check
  CHECK (approver_role IN ('hr','admin'));

ALTER TABLE salary_proposals DROP CONSTRAINT IF EXISTS salary_proposals_status_check;
UPDATE salary_proposals SET status = 'pending_admin' WHERE status IN ('pending_accountant','pending_director');
ALTER TABLE salary_proposals ADD CONSTRAINT salary_proposals_status_check
  CHECK (status IN ('pending_hr','pending_admin','approved','rejected'));

ALTER TABLE onboarding_tasks DROP CONSTRAINT IF EXISTS onboarding_tasks_assignee_role_check;
UPDATE onboarding_tasks SET assignee_role = 'admin' WHERE assignee_role IN ('director','accountant','sysadmin');
ALTER TABLE onboarding_tasks ADD CONSTRAINT onboarding_tasks_assignee_role_check
  CHECK (assignee_role IN ('hr','manager','employee','admin'));

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
UPDATE users SET role = 'admin' WHERE role IN ('director','accountant','sysadmin');
ALTER TABLE users ADD CONSTRAINT users_role_check
  CHECK (role IN ('admin','hr','manager','employee'));
