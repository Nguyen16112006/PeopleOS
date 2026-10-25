// SPDX-License-Identifier: Apache-2.0
package vn.peopleos.bff.offboarding;

/** Truy vấn/đột biến GraphQL cho quy trình nghỉ việc. */
final class OffboardingQueries {
    private OffboardingQueries() {}

    static final String INSERT = """
            mutation ObInsert($obj: offboarding_cases_insert_input!) {
              insert_offboarding_cases_one(object: $obj) { id stage status }
            }""";

    static final String BY_ID = """
            query ObById($id: uuid!) {
              offboarding_cases_by_pk(id: $id) {
                id kind stage status proposed_last_day last_working_day final_pay_amount employee_id
                employee { id user_id full_name manager { user_id } }
              }
            }""";

    static final String OPEN_FOR_EMPLOYEE = """
            query ObOpen($eid: uuid!) {
              offboarding_cases(where: {employee_id: {_eq: $eid}, status: {_eq: "open"}}, limit: 1) { id }
            }""";

    static final String EMPLOYEE = """
            query ObEmployee($id: uuid!) {
              employees_by_pk(id: $id) { id user_id full_name status manager { user_id } }
            }""";

    static final String MOVE = """
            mutation ObMove($id: uuid!, $stage: String!, $status: String!) {
              update_offboarding_cases_by_pk(pk_columns: {id: $id}, _set: {stage: $stage, status: $status}) { id stage status }
            }""";

    static final String SET_LAST_DAY = """
            mutation ObLastDay($id: uuid!, $day: date!) {
              update_offboarding_cases_by_pk(pk_columns: {id: $id}, _set: {last_working_day: $day}) { id }
            }""";

    static final String SET_FINAL_PAY = """
            mutation ObFinalPay($id: uuid!, $amount: bigint!) {
              update_offboarding_cases_by_pk(pk_columns: {id: $id}, _set: {final_pay_amount: $amount}) { id }
            }""";

    /** Chấm dứt hợp đồng đang hiệu lực và đặt nhân viên về terminated (hồ sơ vẫn được giữ lại). */
    static final String TERMINATE_CONTRACT = """
            mutation ObContract($eid: uuid!, $end: date!) {
              update_contracts(where: {employee_id: {_eq: $eid}, status: {_eq: "active"}}, _set: {status: "terminated", end_date: $end}) { affected_rows }
              update_employees_by_pk(pk_columns: {id: $eid}, _set: {status: "terminated"}) { id }
            }""";

    static final String DUE_FOR_LOCK = """
            query ObDue($today: date!) {
              offboarding_cases(where: {stage: {_eq: "done"}, account_locked_at: {_is_null: true}, last_working_day: {_lte: $today}}) {
                id employee { user_id full_name }
              }
            }""";

    static final String MARK_LOCKED = """
            mutation ObLocked($id: uuid!) {
              update_offboarding_cases_by_pk(pk_columns: {id: $id}, _set: {account_locked_at: "now()"}) { id }
            }""";

    static final String DEACTIVATE_USER = """
            mutation ObDeactivate($uid: uuid!) {
              update_users_by_pk(pk_columns: {id: $uid}, _set: {is_active: false}) { id }
            }""";

    static final String EVENT = """
            mutation ObEvent($obj: approval_events_insert_input!) {
              insert_approval_events_one(object: $obj) { id }
            }""";
}
