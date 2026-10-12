package vn.peopleos.bff.leave.dto;

/** Kết quả trả về cho các thao tác nghỉ phép; "days" chỉ có khi tạo đơn. */
public record LeaveResult(String id, String status, Integer days) {
    public static LeaveResult of(String id, String status) { return new LeaveResult(id, status, null); }
}
