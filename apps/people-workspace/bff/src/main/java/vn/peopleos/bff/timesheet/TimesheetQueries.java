// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 PeopleOS contributors

package vn.peopleos.bff.timesheet;

/** Truy vấn/đột biến GraphQL của mục Bảng công. */
final class TimesheetQueries {
    private TimesheetQueries() {}

    static final String DAY = """
            query AttDay($eid: uuid!, $d: date!) {
              attendance_records(where: {employee_id: {_eq: $eid}, work_date: {_eq: $d}}, limit: 1) {
                id work_date check_in check_out status work_days overtime_hours overtime_type note source
              }
            }""";

    static final String DAY_INSERT = """
            mutation AttInsert($obj: attendance_records_insert_input!) {
              insert_attendance_records_one(object: $obj) { id work_date check_in check_out status }
            }""";

    static final String DAY_UPDATE = """
            mutation AttUpdate($id: uuid!, $set: attendance_records_set_input!) {
              update_attendance_records_by_pk(pk_columns: {id: $id}, _set: $set) { id work_date check_in check_out status }
            }""";

    /** Hồ sơ nhân viên (kèm quản lý trực tiếp) để kiểm tra quyền và ngày vào làm. */
    static final String EMPLOYEE = """
            query TsEmployee($id: uuid!) {
              employees_by_pk(id: $id) { id user_id full_name hire_date status manager_id manager { user_id } }
            }""";

    /** Dữ liệu một tháng của một nhân viên: chấm công, đơn nghỉ đã duyệt giao với tháng, bảng công (nếu đã có). */
    static final String MONTH = """
            query TsMonth($eid: uuid!, $from: date!, $to: date!, $y: smallint!, $m: smallint!) {
              attendance_records(where: {employee_id: {_eq: $eid}, work_date: {_gte: $from, _lte: $to}}) {
                work_date status work_days overtime_hours overtime_type source
              }
              leave_requests(where: {employee_id: {_eq: $eid}, status: {_eq: "approved"}, start_date: {_lte: $to}, end_date: {_gte: $from}}) {
                leave_type start_date end_date
              }
              timesheets(where: {employee_id: {_eq: $eid}, period_year: {_eq: $y}, period_month: {_eq: $m}}, limit: 1) {
                id status review_note
              }
            }""";

    static final String PERIOD_STATUS = """
            query TsStatus($eid: uuid!, $y: smallint!, $m: smallint!) {
              timesheets(where: {employee_id: {_eq: $eid}, period_year: {_eq: $y}, period_month: {_eq: $m}}, limit: 1) { id status }
            }""";

    /** Gửi bảng công: tạo mới hoặc ghi đè số liệu tổng hợp của bảng đang mở. */
    static final String SUBMIT = """
            mutation TsSubmit($obj: timesheets_insert_input!) {
              insert_timesheets_one(object: $obj, on_conflict: {constraint: timesheets_employee_id_period_year_period_month_key,
                update_columns: [standard_days, work_days, paid_leave_days, holiday_days, unpaid_leave_days, absent_days,
                                 ot_weekday_hours, ot_weekend_hours, ot_holiday_hours, status, submitted_at, review_note]}) { id status }
            }""";

    /** Cập nhật số liệu tổng hợp sau khi HR sửa công (giữ nguyên trạng thái). */
    static final String RESUMMARIZE = """
            mutation TsResummarize($id: uuid!, $set: timesheets_set_input!) {
              update_timesheets_by_pk(pk_columns: {id: $id}, _set: $set) { id status }
            }""";

    static final String BY_ID = """
            query TsById($id: uuid!) {
              timesheets_by_pk(id: $id) {
                id status period_year period_month employee_id
                employee { id user_id full_name manager_id manager { user_id } }
              }
            }""";

    static final String CONFIRM = """
            mutation TsConfirm($id: uuid!, $by: uuid) {
              update_timesheets_by_pk(pk_columns: {id: $id}, _set: {status: "confirmed", confirmed_by: $by, confirmed_at: "now()", review_note: null}) { id status }
            }""";

    static final String RETURN = """
            mutation TsReturn($id: uuid!, $note: String) {
              update_timesheets_by_pk(pk_columns: {id: $id}, _set: {status: "open", review_note: $note}) { id status }
            }""";

    /** Dữ liệu toàn công ty của một tháng để HR chốt công. */
    static final String CLOSE_DATA = """
            query TsCloseData($from: date!, $to: date!, $y: smallint!, $m: smallint!) {
              employees(where: {status: {_eq: "active"}, hire_date: {_lte: $to}}) { id hire_date }
              attendance_records(where: {work_date: {_gte: $from, _lte: $to}}) {
                employee_id work_date status work_days overtime_hours overtime_type source
              }
              leave_requests(where: {status: {_eq: "approved"}, start_date: {_lte: $to}, end_date: {_gte: $from}}) {
                employee_id leave_type start_date end_date
              }
              timesheets(where: {period_year: {_eq: $y}, period_month: {_eq: $m}}) { employee_id status }
            }""";

    /** Chốt công: khóa mọi bảng công của tháng; không đụng tới người xác nhận và thời điểm gửi đã ghi trước đó. */
    static final String CLOSE = """
            mutation TsClose($objs: [timesheets_insert_input!]!) {
              insert_timesheets(objects: $objs, on_conflict: {constraint: timesheets_employee_id_period_year_period_month_key,
                update_columns: [standard_days, work_days, paid_leave_days, holiday_days, unpaid_leave_days, absent_days,
                                 ot_weekday_hours, ot_weekend_hours, ot_holiday_hours, status, closed_at]}) { affected_rows }
            }""";

    static final String CLOSED_OF_MONTH = """
            query TsClosed($y: smallint!, $m: smallint!) {
              timesheets(where: {period_year: {_eq: $y}, period_month: {_eq: $m}, status: {_eq: "closed"}}) {
                employee_id standard_days work_days paid_leave_days holiday_days ot_weekday_hours ot_weekend_hours ot_holiday_hours
              }
            }""";
}
