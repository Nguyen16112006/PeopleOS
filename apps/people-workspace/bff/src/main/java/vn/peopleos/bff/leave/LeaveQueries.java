package vn.peopleos.bff.leave;

/** Các truy vấn GraphQL của mục Nghỉ phép (gom một chỗ để dễ đọc và rà soát). */
final class LeaveQueries {
    private LeaveQueries() {}

    /** Quỹ phép, các đơn phép năm đang chờ, đơn trùng ngày. */
    static final String CHECK = """
            query LeaveCheck($eid: uuid!, $year: smallint!, $start: date!, $end: date!) {
              leave_balances(where: {employee_id: {_eq: $eid}, year: {_eq: $year}}) { entitled_days used_days }
              pending: leave_requests(where: {employee_id: {_eq: $eid}, status: {_eq: "pending"}, leave_type: {_eq: "annual"}}) { days }
              overlap: leave_requests(where: {employee_id: {_eq: $eid}, status: {_in: ["pending", "approved"]},
                                              start_date: {_lte: $end}, end_date: {_gte: $start}}) { id }
            }""";

    static final String INSERT = """
            mutation NewLeave($obj: leave_requests_insert_input!) {
              insert_leave_requests_one(object: $obj) { id status days }
            }""";

    static final String BY_ID = """
            query LeaveById($id: uuid!) {
              leave_requests_by_pk(id: $id) {
                id status leave_type days start_date end_date employee_id
                employee { id user_id full_name manager { user_id } }
              }
            }""";

    static final String DECIDE = """
            mutation Decide($id: uuid!, $status: String!, $approver: uuid, $note: String) {
              update_leave_requests_by_pk(pk_columns: {id: $id},
                _set: {status: $status, approver_id: $approver, decision_note: $note, decided_at: "now()"}) { id status }
            }""";

    /** %s = used_days (phép năm) hoặc sick_days_used (nghỉ ốm). */
    static final String USE_BALANCE = """
            mutation UseBalance($eid: uuid!, $year: smallint!, $d: numeric!) {
              update_leave_balances(where: {employee_id: {_eq: $eid}, year: {_eq: $year}}, _inc: {%s: $d}) { affected_rows }
            }""";

    static final String CANCEL = """
            mutation Cancel($id: uuid!) {
              update_leave_requests_by_pk(pk_columns: {id: $id}, _set: {status: "cancelled"}) { id status }
            }""";
}
