package vn.peopleos.bff.proposal;

/** Các truy vấn GraphQL của mục Đề xuất tăng lương. */
final class ProposalQueries {
    private ProposalQueries() {}

    static final String TARGET = """
            query ProposalTarget($id: uuid!) {
              employees_by_pk(id: $id) {
                id user_id full_name manager { user_id }
                contracts(where: {status: {_eq: "active"}}, order_by: {start_date: desc}, limit: 1) { id base_salary allowance }
              }
            }""";

    /** Tạo đề xuất kèm 2 bước duyệt (nested insert). */
    static final String CREATE = """
            mutation NewProposal($obj: salary_proposals_insert_input!) {
              insert_salary_proposals_one(object: $obj) { id status }
            }""";

    static final String BY_ID = """
            query ProposalById($id: uuid!) {
              salary_proposals_by_pk(id: $id) {
                id status proposal_type current_amount proposed_amount employee_id
                employee { id user_id full_name }
                proposer { id user_id full_name }
                approval_steps(order_by: {step_order: asc}) { id step_order approver_role status }
              }
            }""";

    static final String DECIDE_STEP = """
            mutation Step($id: uuid!, $status: String!, $approver: uuid, $comment: String) {
              update_approval_steps_by_pk(pk_columns: {id: $id},
                _set: {status: $status, approver_id: $approver, comment: $comment, decided_at: "now()"}) { id }
            }""";

    static final String STEP_STATUS = """
            mutation StepStatus($id: uuid!, $status: String!) {
              update_approval_steps_by_pk(pk_columns: {id: $id}, _set: {status: $status}) { id }
            }""";

    static final String PROPOSAL_STATUS = """
            mutation PStatus($id: uuid!, $status: String!) {
              update_salary_proposals_by_pk(pk_columns: {id: $id}, _set: {status: $status}) { id status }
            }""";

    static final String ACTIVE_CONTRACT = """
            query ActiveContract($eid: uuid!) {
              contracts(where: {employee_id: {_eq: $eid}, status: {_eq: "active"}}, order_by: {start_date: desc}, limit: 1) { id }
            }""";

    /** %s = base_salary hoặc allowance. */
    static final String APPLY = """
            mutation Apply($id: uuid!, $v: bigint!) {
              update_contracts_by_pk(pk_columns: {id: $id}, _set: {%s: $v}) { id }
            }""";
}
