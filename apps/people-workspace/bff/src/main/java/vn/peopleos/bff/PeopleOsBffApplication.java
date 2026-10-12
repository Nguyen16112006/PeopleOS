package vn.peopleos.bff;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;

/**
 * Backend (BFF) của People Workspace - Tầng 2.
 *
 * <p>Cấu trúc theo từng MỤC (package) nghiệp vụ, mỗi mục tự chứa controller, service, dto:
 * <pre>
 *  config/        cấu hình: thuộc tính, bảo mật JWT, WebSocket, CORS
 *  common/        tiện ích dùng chung: lỗi API, ngày làm việc, JSON, tham số
 *  security/      người dùng hiện tại (CurrentUser), ánh xạ vai trò từ JWT
 *  integration/   kết nối Tầng 1: hasura, keycloak, minio, n8n, nats
 *  realtime/      WebSocket /ws, danh sách kết nối theo người dùng
 *  notification/  tạo thông báo (PostgreSQL) + đẩy realtime (NATS)
 *  employee/      hồ sơ nhân sự của người đăng nhập (/api/me)
 *  leave/         nghỉ phép, nghỉ ốm
 *  proposal/      đề xuất tăng lương/phụ cấp, duyệt nhiều cấp
 *  onboarding/    nhân viên mới + checklist hội nhập
 *  document/      PDF phiếu lương, hợp đồng; lưu MinIO
 *  internal/      API nội bộ cho n8n
 *  system/        health check
 * </pre>
 */
@SpringBootApplication
@ConfigurationPropertiesScan
public class PeopleOsBffApplication {
    public static void main(String[] args) {
        SpringApplication.run(PeopleOsBffApplication.class, args);
    }
}
