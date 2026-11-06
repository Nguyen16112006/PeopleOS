// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 PeopleOS contributors

package vn.peopleos.bff.internal;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import java.util.Map;
import java.util.function.Supplier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import vn.peopleos.bff.common.ApiException;
import vn.peopleos.bff.notification.NotificationService;
import vn.peopleos.bff.notification.NotificationService.Target;
import vn.peopleos.bff.onboarding.OnboardingService;
import vn.peopleos.bff.offboarding.OffboardingService;
import vn.peopleos.bff.tempaccess.TempAccessService;
import vn.peopleos.bff.tenant.TenantContext;

/**
 * API NỘI BỘ cho tác vụ nền (không dành cho trình duyệt): APISIX trả 404 cho /api/internal/* từ bên ngoài,
 * và mọi lời gọi còn phải mang header x-internal-key.
 */
@RestController
@RequestMapping("/api/internal")
public class InternalController {
    private final InternalKeyGuard guard;
    private final NotificationService notifications;
    private final OnboardingService onboarding;
    private final TempAccessService tempAccess;
    private final OffboardingService offboarding;
    /** Tenant mặc định cho tác vụ nền khi không gửi header x-tenant-id (tenant first-party). */
    private final String defaultTenantId;

    public InternalController(InternalKeyGuard guard, NotificationService notifications, OnboardingService onboarding,
                              TempAccessService tempAccess, OffboardingService offboarding,
                              @Value("${peopleos.default-tenant-id:00000000-0000-0000-0000-000000000001}") String defaultTenantId) {
        this.defaultTenantId = defaultTenantId;
        this.offboarding = offboarding;
        this.guard = guard;
        this.tempAccess = tempAccess;
        this.notifications = notifications;
        this.onboarding = onboarding;
    }

    public record NotifyRequest(String userId, String role, @NotBlank String title, @NotBlank String message,
                                String refType, String refId, String kind) {}

    /** Tác vụ nội bộ có thể tạo thông báo (lưu DB + đẩy realtime). Người nhận: user_id hoặc role. */
    @PostMapping("/notify")
    public Map<String, Object> notify(@RequestHeader(value = "x-internal-key", required = false) String key,
                                      @RequestHeader(value = "x-tenant-id", required = false) String tenant,
                                      @Valid @RequestBody NotifyRequest body) {
        guard.check(key);
        Target target;
        if (body.userId() != null && !body.userId().isBlank()) target = Target.user(body.userId());
        else if (body.role() != null && !body.role().isBlank()) target = Target.role(body.role());
        else throw ApiException.badRequest("Cần user_id hoặc role");
        int delivered = asTenant(tenant, () -> notifications.notify(target, body.title(), body.message(), body.refType(), body.refId(), body.kind()));
        return Map.of("delivered", delivered);
    }

    /** Khởi tạo checklist và thông báo cho nhân viên mới trong đúng tenant. */
    @PostMapping("/onboarding/initialize")
    public Map<String, Object> initializeOnboarding(@RequestHeader(value = "x-internal-key", required = false) String key,
                                                   @RequestHeader(value = "x-tenant-id", required = false) String tenant,
                                                   @RequestBody Map<String, Object> payload) {
        guard.check(key);
        if (payload == null || payload.isEmpty()) throw ApiException.badRequest("Thiếu payload onboarding");
        asTenant(tenant, () -> {
            onboarding.initializeWorkflow(payload);
            return null;
        });
        return Map.of("initialized", true);
    }

    /** Tác vụ nội bộ: chuyển các quyền tạm thời quá hạn sang trạng thái expired. */
    @PostMapping("/temp-access/expire")
    public Map<String, Object> expireTempAccess(@RequestHeader(value = "x-internal-key", required = false) String key,
                                                @RequestHeader(value = "x-tenant-id", required = false) String tenant) {
        guard.check(key);
        return Map.of("expired", asTenant(tenant, () -> tempAccess.expireOverdue()));
    }

    /** Tác vụ nội bộ: khóa tài khoản của nhân viên đã hoàn tất nghỉ việc và đến ngày làm việc cuối. */
    @PostMapping("/offboarding/lock-due")
    public Map<String, Object> lockDueAccounts(@RequestHeader(value = "x-internal-key", required = false) String key,
                                               @RequestHeader(value = "x-tenant-id", required = false) String tenant) {
        guard.check(key);
        return Map.of("locked", asTenant(tenant, () -> offboarding.lockDueAccounts()));
    }

    /** Chạy dưới tenant được chỉ định (header x-tenant-id) hoặc tenant mặc định. Tenant sai định dạng => 400. */
    private <T> T asTenant(String tenant, Supplier<T> fn) {
        String t = (tenant == null || tenant.isBlank()) ? defaultTenantId : tenant.trim();
        if (!TenantContext.isValid(t)) throw ApiException.badRequest("x-tenant-id không hợp lệ");
        return TenantContext.runAs(t, fn);
    }
}
