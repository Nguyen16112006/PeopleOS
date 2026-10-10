package vn.peopleos.bff.internal;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import java.util.List;
import java.util.Map;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import vn.peopleos.bff.common.ApiException;
import vn.peopleos.bff.notification.NotificationService;
import vn.peopleos.bff.notification.NotificationService.Target;
import vn.peopleos.bff.onboarding.OnboardingService;
import vn.peopleos.bff.onboarding.dto.TaskInput;

/**
 * API NỘI BỘ cho n8n (không dành cho trình duyệt): APISIX trả 404 cho /api/internal/* từ bên ngoài,
 * và mọi lời gọi còn phải mang header x-internal-key.
 */
@RestController
@RequestMapping("/api/internal")
public class InternalController {
    private final InternalKeyGuard guard;
    private final NotificationService notifications;
    private final OnboardingService onboarding;

    public InternalController(InternalKeyGuard guard, NotificationService notifications, OnboardingService onboarding) {
        this.guard = guard;
        this.notifications = notifications;
        this.onboarding = onboarding;
    }

    public record NotifyRequest(String userId, String role, @NotBlank String title, @NotBlank String message,
                                String refType, String refId, String kind) {}

    public record OnboardingTasksRequest(@NotBlank String employeeId, @NotEmpty List<@Valid TaskInput> tasks) {}

    /** n8n gọi để tạo thông báo (lưu DB + đẩy realtime). Người nhận: user_id hoặc role. */
    @PostMapping("/notify")
    public Map<String, Object> notify(@RequestHeader(value = "x-internal-key", required = false) String key,
                                      @Valid @RequestBody NotifyRequest body) {
        guard.check(key);
        Target target;
        if (body.userId() != null && !body.userId().isBlank()) target = Target.user(body.userId());
        else if (body.role() != null && !body.role().isBlank()) target = Target.role(body.role());
        else throw ApiException.badRequest("Cần user_id hoặc role");
        int delivered = notifications.notify(target, body.title(), body.message(), body.refType(), body.refId(), body.kind());
        return Map.of("delivered", delivered);
    }

    /** n8n gọi để tạo checklist onboarding. */
    @PostMapping("/onboarding-tasks")
    public Map<String, Object> onboardingTasks(@RequestHeader(value = "x-internal-key", required = false) String key,
                                               @Valid @RequestBody OnboardingTasksRequest body) {
        guard.check(key);
        return Map.of("created", onboarding.insertTasks(body.employeeId(), body.tasks()));
    }
}
