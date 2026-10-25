// SPDX-License-Identifier: Apache-2.0
package vn.peopleos.bff.taxyear;

/** Truy vấn/đột biến GraphQL cho quy trình thuế TNCN, BHXH cuối năm và báo cáo tài chính năm. */
final class TaxYearQueries {
    private TaxYearQueries() {}

    static final String CLOSING = """
            query TyClosing($y: smallint!) { tax_year_closings_by_pk(year: $y) { year status } }""";

    static final String CLOSING_UPSERT = """
            mutation TyClosingUpsert($obj: tax_year_closings_insert_input!, $cols: [tax_year_closings_update_column!]!) {
              insert_tax_year_closings_one(object: $obj, on_conflict: {constraint: tax_year_closings_pkey, update_columns: $cols}) { year status }
            }""";

    static final String PAYROLLS_OF_YEAR = """
            query TyPayrolls($y: smallint!) {
              payrolls(where: {period_year: {_eq: $y}, status: {_eq: "paid"}}) {
                employee_id gross bhxh_employee bhyt_employee bhtn_employee taxable_income personal_income_tax net_salary
              }
            }""";

    static final String EMPLOYEES_BY_IDS = """
            query TyEmployees($ids: [uuid!]!) {
              employees(where: {id: {_in: $ids}}) { id user_id full_name tax_code dependents department }
            }""";

    static final String INSURANCE_OF_YEAR = """
            query TyInsurance($from: date!, $to: date!) {
              insurance_records(where: {period: {_gte: $from, _lte: $to}}) { bhxh_employer bhyt_employer bhtn_employer }
            }""";

    static final String CERT_UPSERT = """
            mutation TyCerts($objs: [tax_certificates_insert_input!]!) {
              insert_tax_certificates(objects: $objs, on_conflict: {constraint: tax_certificates_year_employee_id_key,
                update_columns: [months, gross_total, insurance_total, taxable_total, pit_withheld, net_total, dependents, tax_code, issued_at]}) { affected_rows }
            }""";

    static final String REPORT = """
            query TyReport($y: smallint!) { annual_reports_by_pk(year: $y) { year status } }""";

    static final String REPORT_UPSERT = """
            mutation TyReportUpsert($obj: annual_reports_insert_input!) {
              insert_annual_reports_one(object: $obj, on_conflict: {constraint: annual_reports_pkey,
                update_columns: [status, figures, prepared_by, prepared_at, approved_by, approved_at, director_comment]}) { year status }
            }""";

    static final String REPORT_APPROVE = """
            mutation TyReportApprove($y: smallint!, $by: uuid!) {
              update_annual_reports_by_pk(pk_columns: {year: $y}, _set: {status: "approved", approved_by: $by, approved_at: "now()"}) { year status }
            }""";

    static final String REPORT_RETURN = """
            mutation TyReportReturn($y: smallint!, $comment: String) {
              update_annual_reports_by_pk(pk_columns: {year: $y}, _set: {status: "returned", director_comment: $comment}) { year status }
            }""";

    static final String BUDGET = """
            query TyBudget($y: smallint!) { hr_budgets_by_pk(year: $y) { year status } }""";

    static final String BUDGET_UPSERT = """
            mutation TyBudgetUpsert($obj: hr_budgets_insert_input!) {
              insert_hr_budgets_one(object: $obj, on_conflict: {constraint: hr_budgets_pkey,
                update_columns: [payroll_fund, headcount_plan, note, status, proposed_by]}) { year status }
            }""";

    static final String BUDGET_APPROVE = """
            mutation TyBudgetApprove($y: smallint!, $by: uuid!) {
              update_hr_budgets_by_pk(pk_columns: {year: $y}, _set: {status: "approved", approved_by: $by, approved_at: "now()"}) { year status }
            }""";
}
