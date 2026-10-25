// SPDX-License-Identifier: Apache-2.0
package vn.peopleos.bff.tempaccess;

/** Truy vấn/đột biến GraphQL cho quy trình cấp quyền tạm thời. */
final class TempAccessQueries {
    private TempAccessQueries() {}

    static final String INSERT = """
            mutation TaInsert($obj: temp_access_requests_insert_input!) {
              insert_temp_access_requests_one(object: $obj) { id status }
            }""";

    static final String BY_ID = """
            query TaById($id: uuid!) {
              temp_access_requests_by_pk(id: $id) {
                id status scope data_owner_role duration_minutes requester_id
                owner_approved_at director_approved_at expires_at
                requester { user_id full_name }
              }
            }""";

    static final String OWNER_APPROVE = """
            mutation TaOwner($id: uuid!, $aid: uuid!) {
              update_temp_access_requests_by_pk(pk_columns: {id: $id}, _set: {owner_approver_id: $aid, owner_approved_at: "now()"}) { id }
            }""";

    static final String DIRECTOR_APPROVE = """
            mutation TaDirector($id: uuid!, $aid: uuid!) {
              update_temp_access_requests_by_pk(pk_columns: {id: $id}, _set: {director_approver_id: $aid, director_approved_at: "now()"}) { id }
            }""";

    static final String GRANT = """
            mutation TaGrant($id: uuid!, $expires: timestamptz!) {
              update_temp_access_requests_by_pk(pk_columns: {id: $id}, _set: {status: "approved", granted_at: "now()", expires_at: $expires}) { id status expires_at }
            }""";

    static final String SET_STATUS = """
            mutation TaStatus($id: uuid!, $status: String!) {
              update_temp_access_requests_by_pk(pk_columns: {id: $id}, _set: {status: $status}) { id status }
            }""";

    static final String REVOKE = """
            mutation TaRevoke($id: uuid!) {
              update_temp_access_requests_by_pk(pk_columns: {id: $id}, _set: {status: "revoked", revoked_at: "now()"}) { id status }
            }""";

    static final String EXPIRE_OVERDUE = """
            mutation TaExpire($now: timestamptz!) {
              update_temp_access_requests(where: {status: {_eq: "approved"}, expires_at: {_lt: $now}}, _set: {status: "expired"}) { affected_rows }
            }""";

    static final String ACTIVE_GRANT = """
            query TaActive($rid: uuid!, $scope: String!, $now: timestamptz!) {
              temp_access_requests(where: {requester_id: {_eq: $rid}, scope: {_eq: $scope}, status: {_eq: "approved"}, expires_at: {_gt: $now}}, limit: 1) { id expires_at }
            }""";

    static final String EVENT = """
            mutation TaEvent($obj: approval_events_insert_input!) {
              insert_approval_events_one(object: $obj) { id }
            }""";
}
