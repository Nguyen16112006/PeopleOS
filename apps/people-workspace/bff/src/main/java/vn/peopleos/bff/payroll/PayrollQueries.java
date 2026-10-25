// SPDX-License-Identifier: Apache-2.0
package vn.peopleos.bff.payroll;

/** Truy vấn/đột biến GraphQL cho kỳ lương hằng tháng và khiếu nại phiếu lương. */
final class PayrollQueries {
    private PayrollQueries() {}

    static final String RUN_BY_ID = """
            query PrRun($id: uuid!) { payroll_runs_by_pk(id: $id) { id period_year period_month status } }""";

    static final String RUN_EXISTS = """
            query PrRunExists($y: smallint!, $m: smallint!) {
              payroll_runs(where: {period_year: {_eq: $y}, period_month: {_eq: $m}}, limit: 1) { id }
              payrolls_aggregate(where: {period_year: {_eq: $y}, period_month: {_eq: $m}, status: {_eq: "paid"}}) { aggregate { count } }
            }""";

    static final String RUN_INSERT = """
            mutation PrRunInsert($obj: payroll_runs_insert_input!) {
              insert_payroll_runs_one(object: $obj) { id status }
            }""";

    static final String RUN_CALCULATED = """
            mutation PrRunCalc($id: uuid!, $by: uuid!, $count: Int!, $gross: bigint!, $net: bigint!) {
              update_payroll_runs_by_pk(pk_columns: {id: $id}, _set: {status: "calculated", calculated_by: $by, calculated_at: "now()",
                employee_count: $count, total_gross: $gross, total_net: $net, return_comment: null}) { id status }
            }""";

    static final String RUN_REVIEWED = """
            mutation PrRunReviewed($id: uuid!, $by: uuid!) {
              update_payroll_runs_by_pk(pk_columns: {id: $id}, _set: {status: "hr_reviewed", hr_reviewed_by: $by, hr_reviewed_at: "now()"}) { id status }
            }""";

    static final String RUN_APPROVED = """
            mutation PrRunApproved($id: uuid!, $by: uuid!) {
              update_payroll_runs_by_pk(pk_columns: {id: $id}, _set: {status: "approved", approved_by: $by, approved_at: "now()"}) { id status }
            }""";

    /** HR hoặc Giám đốc trả bảng lương về Kế toán tính lại. */
    static final String RUN_RETURN = """
            mutation PrRunReturn($id: uuid!, $comment: String) {
              update_payroll_runs_by_pk(pk_columns: {id: $id}, _set: {status: "timesheet_closed", return_comment: $comment}) { id status }
            }""";

    static final String RUN_PAID = """
            mutation PrRunPaid($id: uuid!, $by: uuid!) {
              update_payroll_runs_by_pk(pk_columns: {id: $id}, _set: {status: "paid", paid_by: $by, paid_at: "now()"}) { id status }
            }""";

    /** Hợp đồng đang hiệu lực kèm thông tin nhân viên đủ điều kiện tính lương tháng (nhân viên đang làm việc, vào làm trước cuối tháng). */
    static final String ELIGIBLE = """
            query PrEligible($end: date!) {
              contracts(where: {status: {_eq: "active"}, start_date: {_lte: $end}, employee: {status: {_eq: "active"}, hire_date: {_lte: $end}}}) {
                employee_id base_salary allowance employee { id user_id full_name dependents region }
              }
            }""";

    static final String PAYROLL_UPSERT = """
            mutation PrPayrolls($objs: [payrolls_insert_input!]!) {
              insert_payrolls(objects: $objs, on_conflict: {constraint: payrolls_employee_id_period_year_period_month_key,
                update_columns: [base_salary, allowance, overtime_pay, bonus, gross, insured_salary, bhxh_employee, bhyt_employee,
                                 bhtn_employee, taxable_income, personal_income_tax, net_salary, status]}) { affected_rows }
            }""";

    /** Các dòng lương của một tháng để phát hành. */
    static final String PAYROLLS_OF_MONTH = """
            query PrOfMonth($y: smallint!, $m: smallint!) {
              payrolls(where: {period_year: {_eq: $y}, period_month: {_eq: $m}}) {
                id employee_id gross insured_salary status employee { user_id dependents region }
              }
            }""";

    static final String PAYROLLS_PAID = """
            mutation PrPay($y: smallint!, $m: smallint!, $today: date!) {
              update_payrolls(where: {period_year: {_eq: $y}, period_month: {_eq: $m}, status: {_eq: "draft"}}, _set: {status: "paid", paid_at: $today}) { affected_rows }
            }""";

    static final String INSURANCE_UPSERT = """
            mutation PrInsurance($objs: [insurance_records_insert_input!]!) {
              insert_insurance_records(objects: $objs, on_conflict: {constraint: insurance_records_employee_id_period_key,
                update_columns: [insured_salary, bhxh_employee, bhyt_employee, bhtn_employee, bhxh_employer, bhyt_employer, bhtn_employer]}) { affected_rows }
            }""";

    // ---- khiếu nại phiếu lương ----
    static final String PAYROLL_BY_ID = """
            query PrPayroll($id: uuid!) {
              payrolls_by_pk(id: $id) {
                id status period_year period_month employee_id base_salary allowance overtime_pay bonus
                employee { id user_id full_name dependents region }
              }
            }""";

    static final String COMPLAINT_INSERT = """
            mutation PcInsert($obj: payslip_complaints_insert_input!) {
              insert_payslip_complaints_one(object: $obj) { id status }
            }""";

    static final String COMPLAINT_BY_ID = """
            query PcById($id: uuid!) {
              payslip_complaints_by_pk(id: $id) { id status payroll_id employee { user_id full_name } }
            }""";

    static final String COMPLAINT_ACTIVE_FOR_PAYROLL = """
            query PcActive($pid: uuid!) {
              payslip_complaints(where: {payroll_id: {_eq: $pid}, status: {_in: ["open", "adjusting"]}}, limit: 1) { id }
            }""";

    static final String COMPLAINT_HR = """
            mutation PcHr($id: uuid!, $status: String!, $note: String, $by: uuid!) {
              update_payslip_complaints_by_pk(pk_columns: {id: $id}, _set: {status: $status, hr_note: $note, hr_handled_by: $by}) { id status }
            }""";

    static final String COMPLAINT_RESOLVED = """
            mutation PcResolved($id: uuid!, $note: String, $by: uuid!) {
              update_payslip_complaints_by_pk(pk_columns: {id: $id}, _set: {status: "resolved", adjustment_note: $note, adjusted_by: $by}) { id status }
            }""";

    static final String PAYROLL_UPDATE = """
            mutation PrUpdate($id: uuid!, $set: payrolls_set_input!) {
              update_payrolls_by_pk(pk_columns: {id: $id}, _set: $set) { id }
            }""";
}
