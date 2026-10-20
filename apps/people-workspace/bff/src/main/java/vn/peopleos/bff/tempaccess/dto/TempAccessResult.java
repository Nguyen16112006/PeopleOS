package vn.peopleos.bff.tempaccess.dto;

/** status ∈ pending | approved | rejected | expired | revoked; expiresAt (ISO-8601) chỉ có khi đã được cấp. */
public record TempAccessResult(String id, String status, String expiresAt) {}
