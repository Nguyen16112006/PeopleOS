package vn.peopleos.bff.offboarding;

import com.fasterxml.jackson.databind.JsonNode;
import java.time.LocalDate;
import org.springframework.stereotype.Service;
import vn.peopleos.bff.audit.AuditService;
import vn.peopleos.bff.common.ApiException;
import vn.peopleos.bff.common.Json;
import vn.peopleos.bff.common.Params;
import vn.peopleos.bff.employee.EmployeeLookup;
import vn.peopleos.bff.integration.hasura.HasuraClient;
import vn.peopleos.bff.integration.keycloak.KeycloakAdminClient;
import vn.peopleos.bff.notification.NotificationService;
import vn.peopleos.bff.notification.NotificationService.Target;
import vn.peopleos.bff.offboarding.dto.OffboardingActionRequest;
import vn.peopleos.bff.offboarding.dto.OffboardingResult;
import vn.peopleos.bff.offboarding.dto.ProposeTerminationRequest;
import vn.peopleos.bff.offboarding.dto.SubmitResignationRequest;
import vn.peopleos.bff.security.CurrentUser;

/**
 * Quy trình nghỉ việc (offboarding).
 *
 * <p>Giai đoạn: manager → hr_review → handover → timesheet → final_payroll → director_payroll → payment → terminate → done.
 * Đơn của Quản lý/HR/Kế toán/Admin bắt đầu ở director_confirm (Giám đốc xác nhận); đơn của Giám đốc đi thẳng hr_review.
 * Công ty chấm dứt hợp đồng: Quản lý đề xuất (bắt đầu ở hr_review) → HR thẩm định → director_decision → handover → …
 * Tài khoản Keycloak tự khóa vào ngày làm việc cuối ({@link #lockDueAccounts()}); hồ sơ được giữ lại, không xóa.
 */
@Service
public class OffboardingService {
    private final HasuraClient hasura;
    private final EmployeeLookup employees;
    private final NotificationService notifications;
    private final AuditService audit;
    private final KeycloakAdminClient keycloak;

    public OffboardingService(HasuraClient hasura, EmployeeLookup employees, NotificationService notifications,
                              AuditService audit, KeycloakAdminClient keycloak) {
        this.hasura = hasura;
        this.employees = employees;
        this.notifications = notifications;
        this.audit = audit;
        this.keycloak = keycloak;
    }

    // ------------------------------------------------------------------ quy tắc giai đoạn (thuần, dễ kiểm thử)
    /** Giai đoạn đầu tiên của đơn xin nghỉ việc theo vai trò người nộp đơn. */
    static String initialResignationStage(String role, boolean hasManager) {
        if ("director".equals(role)) return "hr_review";
        if ("employee".equals(role) && hasManager) return "manager";
        return "director_confirm";
    }

    /** Giai đoạn kế tiếp khi người giữ bước hiện tại duyệt (approve). */
    static String nextStage(String kind, String stage) {
        return switch (stage) {
            case "manager", "director_confirm" -> "hr_review";
            case "hr_review" -> "termination".equals(kind) ? "director_decision" : "handover";
            case "director_decision" -> "handover";
            case "handover" -> "timesheet";
            case "timesheet" -> "final_payroll";
            case "final_payroll" -> "director_payroll";
            case "director_payroll" -> "payment";
            case "payment" -> "terminate";
            case "terminate" -> "done";
            default -> throw ApiException.conflict("Hồ sơ đang ở giai đoạn '" + stage + "', không còn bước xử lý");
        };
    }

    /** Vai trò được xử lý ở giai đoạn này ("manager" nghĩa là quản lý trực tiếp của nhân viên). */
    static String actorRole(String stage) {
        return switch (stage) {
            case "manager" -> "manager";
            case "director_confirm", "director_decision", "director_payroll" -> "director";
            case "hr_review", "handover", "timesheet", "terminate" -> "hr";
            case "final_payroll", "payment" -> "accountant";
            default -> throw ApiException.conflict("Hồ sơ đang ở giai đoạn '" + stage + "', không còn bước xử lý");
        };
    }

    /** Các giai đoạn cho phép từ chối (đóng hồ sơ). director_payroll từ chối thì trả về final_payroll. */
    static boolean canReject(String stage) {
        return switch (stage) {
            case "manager", "director_confirm", "hr_review", "director_decision" -> true;
            default -> false;
        };
    }

    // ------------------------------------------------------------------ 1. Nhân viên gửi đơn xin nghỉ việc
    public OffboardingResult submitResignation(CurrentUser user, SubmitResignationRequest req) {
        JsonNode emp = employees.requireByUser(user.sub());
        ensureNoOpenCase(emp.get("id").asText());
        boolean hasManager = Json.text(emp.path("manager"), "user_id") != null;
        String stage = initialResignationStage(user.role(), hasManager);
        String id = insert(emp.get("id").asText(), "resignation", req.reason(), req.lastWorkingDay(), stage, emp.get("id").asText());
        notifyStage(stage, emp.get("full_name").asText(), id, Json.text(emp.path("manager"), "user_id"));
        audit.record(user, "OFFBOARDING.RESIGNATION_SUBMITTED", "offboarding_case", id,
                Params.of("proposed_last_day", req.lastWorkingDay().toString(), "stage", stage));
        return new OffboardingResult(id, stage, "open");
    }

    // ------------------------------------------------------------------ 2. Quản lý đề xuất chấm dứt hợp đồng
    public OffboardingResult proposeTermination(CurrentUser user, ProposeTerminationRequest req) {
        if (!user.isManager()) throw ApiException.forbidden("Chỉ Quản lý được đề xuất chấm dứt hợp đồng với nhân viên trong nhóm");
        JsonNode target = hasura.query(OffboardingQueries.EMPLOYEE, Params.of("id", req.employeeId())).get("employees_by_pk");
        if (Json.isMissing(target)) throw ApiException.notFound("Không tìm thấy nhân viên");
        if (user.sub().equals(Json.text(target, "user_id"))) throw ApiException.forbidden("Không thể tự đề xuất chấm dứt hợp đồng của chính mình");
        if (!user.sub().equals(Json.text(target.path("manager"), "user_id"))) throw ApiException.forbidden("Chỉ đề xuất cho nhân viên trong nhóm của bạn");
        if ("terminated".equals(target.get("status").asText())) throw ApiException.conflict("Nhân viên đã nghỉ việc");
        ensureNoOpenCase(req.employeeId());

        JsonNode proposer = employees.requireByUser(user.sub());
        String id = insert(req.employeeId(), "termination", req.reason(), req.lastWorkingDay(), "hr_review", proposer.get("id").asText());
        notifyStage("hr_review", target.get("full_name").asText(), id, null);
        audit.record(user, "OFFBOARDING.TERMINATION_PROPOSED", "offboarding_case", id,
                Params.of("employee", target.get("full_name").asText(), "reason", req.reason()));
        return new OffboardingResult(id, "hr_review", "open");
    }

    // ------------------------------------------------------------------ 3. Người giữ bước hiện tại xử lý
    public OffboardingResult act(CurrentUser user, String caseId, OffboardingActionRequest body) {
        JsonNode c = hasura.query(OffboardingQueries.BY_ID, Params.of("id", caseId)).get("offboarding_cases_by_pk");
        if (Json.isMissing(c)) throw ApiException.notFound("Không tìm thấy hồ sơ nghỉ việc");
        if (!"open".equals(c.get("status").asText())) throw ApiException.conflict("Hồ sơ đã ở trạng thái '" + c.get("status").asText() + "'");

        JsonNode emp = c.get("employee");
        String stage = c.get("stage").asText();
        String kind = c.get("kind").asText();
        if (user.sub().equals(Json.text(emp, "user_id"))) throw ApiException.forbidden("Không thể tự xử lý hồ sơ nghỉ việc của chính mình");

        String role = actorRole(stage);
        boolean allowed = switch (role) {
            case "manager" -> user.sub().equals(Json.text(emp.path("manager"), "user_id"));
            case "director" -> user.isDirector();
            case "hr" -> user.isHr();
            default -> user.isAccountant();
        };
        if (!allowed) throw ApiException.forbidden("Giai đoạn '" + stage + "' do " + roleLabel(role) + " xử lý");

        boolean approve = "approve".equals(body.decision());
        if (!approve && !canReject(stage) && !"director_payroll".equals(stage)) {
            throw ApiException.badRequest("Giai đoạn '" + stage + "' không có thao tác từ chối");
        }
        String employeeId = c.get("employee_id").asText();
        String employeeName = emp.get("full_name").asText();
        JsonNode actor = employees.requireByUser(user.sub());

        OffboardingResult result;
        if (!approve && "director_payroll".equals(stage)) {          // Giám đốc không duyệt lương cuối: trả về Kế toán
            hasura.query(OffboardingQueries.MOVE, Params.of("id", caseId, "stage", "final_payroll", "status", "open"));
            result = new OffboardingResult(caseId, "final_payroll", "open");
            notifyStage("final_payroll", employeeName, caseId, null);
        } else if (!approve) {                                          // đóng hồ sơ
            hasura.query(OffboardingQueries.MOVE, Params.of("id", caseId, "stage", "closed", "status", "rejected"));
            result = new OffboardingResult(caseId, "closed", "rejected");
            notifications.notify(Target.user(Json.text(emp, "user_id")), "Hồ sơ nghỉ việc không được chấp thuận",
                    "Hồ sơ của bạn bị từ chối" + (body.comment() == null ? "." : ": " + body.comment()), "offboarding", caseId, "offboarding.rejected");
        } else {
            if ("manager".equals(stage) || "director_confirm".equals(stage)) {         // chốt ngày làm việc cuối
                LocalDate day = body.lastWorkingDay() != null ? body.lastWorkingDay()
                        : (c.hasNonNull("proposed_last_day") ? LocalDate.parse(c.get("proposed_last_day").asText()) : null);
                if (day == null) throw ApiException.badRequest("Cần chốt ngày làm việc cuối");
                hasura.query(OffboardingQueries.SET_LAST_DAY, Params.of("id", caseId, "day", day.toString()));
            }
            if ("final_payroll".equals(stage)) {                                          // Kế toán tính lương cuối
                if (body.finalPayAmount() == null) throw ApiException.badRequest("Kế toán cần nhập số tiền lương cuối kỳ");
                hasura.query(OffboardingQueries.SET_FINAL_PAY, Params.of("id", caseId, "amount", body.finalPayAmount()));
            }
            String next = nextStage(kind, stage);
            if ("done".equals(next)) {
                result = finish(caseId, employeeId, c);
            } else {
                hasura.query(OffboardingQueries.MOVE, Params.of("id", caseId, "stage", next, "status", "open"));
                result = new OffboardingResult(caseId, next, "open");
                notifyStage(next, employeeName, caseId, Json.text(emp.path("manager"), "user_id"));
            }
        }
        hasura.query(OffboardingQueries.EVENT, Params.of("obj", Params.of("ref_type", "offboarding", "ref_id", caseId, "stage", stage,
                "actor_id", actor.get("id").asText(), "decision", approve ? "approved" : "rejected", "comment", body.comment())));
        audit.record(user, "OFFBOARDING." + (approve ? "APPROVED" : "REJECTED"), "offboarding_case", caseId,
                Params.of("employee", employeeName, "stage", stage, "result_stage", result.stage()));
        return result;
    }

    // ------------------------------------------------------------------ 4. Khóa tài khoản vào ngày làm việc cuối
    /** Khóa Keycloak + đặt users.is_active=false cho các hồ sơ đã hoàn tất và đến ngày làm việc cuối. Gọi định kỳ (n8n). */
    public int lockDueAccounts() {
        JsonNode due = hasura.query(OffboardingQueries.DUE_FOR_LOCK, Params.of("today", LocalDate.now().toString())).path("offboarding_cases");
        int locked = 0;
        for (JsonNode c : due) {
            String userId = Json.text(c.path("employee"), "user_id");
            try {
                if (userId != null) {
                    keycloak.disableUser(userId);
                    hasura.query(OffboardingQueries.DEACTIVATE_USER, Params.of("uid", userId));
                }
                hasura.query(OffboardingQueries.MARK_LOCKED, Params.of("id", c.get("id").asText()));
                audit.record(null, "OFFBOARDING.ACCOUNT_LOCKED", "offboarding_case", c.get("id").asText(),
                        Params.of("employee", c.path("employee").path("full_name").asText()));
                locked++;
            } catch (RuntimeException e) {
                // Giữ nguyên để lần chạy sau thử lại; không làm hỏng các hồ sơ khác
            }
        }
        return locked;
    }

    // ------------------------------------------------------------------ helper
    private OffboardingResult finish(String caseId, String employeeId, JsonNode c) {
        String lastDay = c.hasNonNull("last_working_day") ? c.get("last_working_day").asText() : LocalDate.now().toString();
        hasura.query(OffboardingQueries.TERMINATE_CONTRACT, Params.of("eid", employeeId, "end", lastDay));
        hasura.query(OffboardingQueries.MOVE, Params.of("id", caseId, "stage", "done", "status", "completed"));
        if (!LocalDate.parse(lastDay).isAfter(LocalDate.now())) lockDueAccounts();   // đã đến ngày cuối thì khóa ngay
        return new OffboardingResult(caseId, "done", "completed");
    }

    private void ensureNoOpenCase(String employeeId) {
        JsonNode open = hasura.query(OffboardingQueries.OPEN_FOR_EMPLOYEE, Params.of("eid", employeeId)).path("offboarding_cases");
        if (open.isArray() && !open.isEmpty()) throw ApiException.conflict("Nhân viên đã có hồ sơ nghỉ việc đang mở");
    }

    private String insert(String employeeId, String kind, String reason, LocalDate lastDay, String stage, String initiatorId) {
        JsonNode created = hasura.query(OffboardingQueries.INSERT, Params.of("obj", Params.of(
                "employee_id", employeeId, "kind", kind, "reason", reason, "proposed_last_day", lastDay.toString(),
                "stage", stage, "status", "open", "initiated_by", initiatorId))).get("insert_offboarding_cases_one");
        return created.get("id").asText();
    }

    private static String roleLabel(String role) {
        return switch (role) {
            case "manager" -> "quản lý trực tiếp";
            case "director" -> "Giám đốc";
            case "hr" -> "HR";
            default -> "Kế toán";
        };
    }

    private void notifyStage(String stage, String employeeName, String id, String managerUserId) {
        String role = actorRole(stage);
        Target target = switch (role) {
            case "manager" -> managerUserId != null ? Target.user(managerUserId) : Target.role("director");
            default -> Target.role(role);
        };
        notifications.notify(target, "Hồ sơ nghỉ việc chờ bạn xử lý", "Hồ sơ nghỉ việc của " + employeeName + " đang ở bước '" + stage + "'.",
                "offboarding", id, "offboarding.pending");
    }
}
