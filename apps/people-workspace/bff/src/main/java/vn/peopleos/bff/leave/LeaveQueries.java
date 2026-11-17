// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 PeopleOS contributors

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
              insert_leave_requests_one(object: $obj) { id status stage days }
            }""";

    static final String BY_ID = """
            query LeaveById($id: uuid!) {
              leave_requests_by_pk(id: $id) {
                id status stage leave_type days start_date end_date employee_id
                employee { id user_id full_name manager { user_id } }
              }
            }""";

    /**
     * Có điều kiện: chỉ cập nhật khi đơn VẪN pending và ở đúng giai đoạn đã kiểm tra quyền (chống duyệt trùng song song).
     * Quỹ phép được trừ bởi trigger trg_leave_apply_balance trong cùng giao dịch (migration 1760000000013).
     */
    static final String DECIDE = """
            mutation Decide($id: uuid!, $stage: String!, $status: String!, $approver: uuid, $note: String) {
              update_leave_requests(where: {id: {_eq: $id}, status: {_eq: "pending"}, stage: {_eq: $stage}},
                _set: {status: $status, stage: "done", approver_id: $approver, decision_note: $note, decided_at: "now()"}) { affected_rows }
            }""";

    /** Chuyển đơn sang giai đoạn duyệt kế tiếp (đơn vẫn ở trạng thái pending). */
    static final String STAGE = """
            mutation LeaveStage($id: uuid!, $from: String!, $stage: String!) {
              update_leave_requests(where: {id: {_eq: $id}, status: {_eq: "pending"}, stage: {_eq: $from}}, _set: {stage: $stage}) { affected_rows }
            }""";

    static final String CANCEL = """
            mutation Cancel($id: uuid!) {
              update_leave_requests(where: {id: {_eq: $id}, status: {_eq: "pending"}}, _set: {status: "cancelled"}) { affected_rows }
            }""";
}
