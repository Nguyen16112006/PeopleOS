package vn.peopleos.bff.onboarding.dto;

import java.util.Map;

/** Kết quả onboarding; account chứa username + mật khẩu tạm (hoặc thông báo lỗi nếu chưa tạo được SSO). */
public record NewEmployeeResponse(String employeeId, String employeeCode, Map<String, Object> account) {}
