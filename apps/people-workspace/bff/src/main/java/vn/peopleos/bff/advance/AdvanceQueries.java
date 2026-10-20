package vn.peopleos.bff.advance;

/** Truy vấn/đột biến GraphQL cho quy trình tạm ứng / hoàn ứng / thanh toán chi phí. */
final class AdvanceQueries {
    private AdvanceQueries() {}

    static final String INSERT = """
            mutation AdvInsert($obj: advance_requests_insert_input!) {
              insert_advance_requests_one(object: $obj) { id stage status }
            }""";

    static final String BY_ID = """
            query AdvById($id: uuid!) {
              advance_requests_by_pk(id: $id) {
                id status stage amount request_type reason settled_amount employee_id
                employee { id user_id full_name manager { user_id } }
              }
            }""";

    static final String MOVE = """
            mutation AdvMove($id: uuid!, $stage: String!, $status: String!) {
              update_advance_requests_by_pk(pk_columns: {id: $id}, _set: {stage: $stage, status: $status}) { id stage status }
            }""";

    static final String PAID = """
            mutation AdvPaid($id: uuid!, $stage: String!) {
              update_advance_requests_by_pk(pk_columns: {id: $id}, _set: {stage: $stage, status: "approved", paid_at: "now()"}) { id stage status }
            }""";

    static final String SETTLE_SUBMIT = """
            mutation AdvSettleSubmit($id: uuid!, $amount: bigint!) {
              update_advance_requests_by_pk(pk_columns: {id: $id}, _set: {settled_amount: $amount}) { id }
            }""";

    static final String SETTLE_CONFIRM = """
            mutation AdvSettleConfirm($id: uuid!) {
              update_advance_requests_by_pk(pk_columns: {id: $id}, _set: {stage: "settled", settled_at: "now()"}) { id stage status }
            }""";

    static final String EVENT = """
            mutation AdvEvent($obj: approval_events_insert_input!) {
              insert_approval_events_one(object: $obj) { id }
            }""";

    static final String THRESHOLD = """
            query AdvThreshold {
              app_settings_by_pk(key: "advance_level2_threshold_vnd") { value }
            }""";
}
