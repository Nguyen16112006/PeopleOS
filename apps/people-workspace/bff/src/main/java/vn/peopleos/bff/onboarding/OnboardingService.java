package vn.peopleos.bff.onboarding;

import com.fasterxml.jackson.databind.JsonNode;
import java.security.SecureRandom;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import vn.peopleos.bff.audit.AuditService;
import vn.peopleos.bff.common.ApiException;
import vn.peopleos.bff.common.Json;
import vn.peopleos.bff.common.Params;
import vn.peopleos.bff.common.VnName;
import vn.peopleos.bff.integration.hasura.HasuraClient;
import vn.peopleos.bff.integration.keycloak.KeycloakAdminClient;
import vn.peopleos.bff.integration.n8n.WorkflowClient;
import vn.peopleos.bff.onboarding.dto.NewEmployeeRequest;
import vn.peopleos.bff.onboarding.dto.NewEmployeeResponse;
import vn.peopleos.bff.onboarding.dto.TaskInput;
import vn.peopleos.bff.onboarding.dto.TaskResult;
import vn.peopleos.bff.security.CurrentUser;

/**
 * Onboarding nhân viên mới: tạo hồ sơ + hợp đồng + quỹ phép (+ tài khoản SSO Keycloak),
 * rồi giao cho workflow n8n sinh checklist hội nhập và gửi thông báo.
 */
@Service
public class OnboardingService {
    private static final Logger log = LoggerFactory.getLogger(OnboardingService.class);
    private static final SecureRandom RANDOM = new SecureRandom();

    /** Checklist mặc định (dự phòng khi n8n không chạy): tiêu đề, người phụ trách, số ngày kể từ ngày bắt đầu. */
    private static final List<Object[]> DEFAULT_TASKS = List.of(
            new Object[] {"Ký hợp đồng và nộp hồ sơ cá nhân", "hr", 0},
            new Object[] {"Tạo tài khoản email và SSO", "hr", 1},
            new Object[] {"Cấp laptop và thiết bị làm việc", "hr", 3},
            new Object[] {"Đăng ký BHXH, BHYT và mã số thuế", "hr", 14},
            new Object[] {"Phân công mentor và giới thiệu nhóm", "manager", 3},
            new Object[] {"Hoàn thành khóa nội quy và an toàn thông tin", "employee", 14});

    private final HasuraClient hasura;
    private final KeycloakAdminClient keycloak;
    private final WorkflowClient workflows;
    private final AuditService audit;

    public OnboardingService(HasuraClient hasura, KeycloakAdminClient keycloak, WorkflowClient workflows, AuditService audit) {
        this.audit = audit;
        this.hasura = hasura;
        this.keycloak = keycloak;
        this.workflows = workflows;
    }

    // ------------------------------------------------------------------ 1. Tạo nhân viên mới
    public NewEmployeeResponse createEmployee(CurrentUser user, NewEmployeeRequest req) {
        if (!user.hasAny("hr", "admin")) throw ApiException.forbidden("Cần một trong các vai trò: hr, admin");

        int count = hasura.query(OnboardingQueries.COUNT, null).get("employees_aggregate").get("aggregate").get("count").asInt();
        String code = String.format("NV%04d", count + 1);

        Map<String, Object> account = null;
        String userId = null;
        if (req.createAccount() == null || req.createAccount()) {
            String username = req.email().split("@")[0].toLowerCase();
            String tempPassword = "Tmp@" + randomToken();
            VnName.Parts name = VnName.split(req.fullName());
            try {
                userId = keycloak.createUser(username, req.email(), name.lastName(), name.firstName(), tempPassword, List.of("employee"));
                hasura.query(OnboardingQueries.NEW_USER, Params.of("obj", Params.of(
                        "id", userId, "username", username, "email", req.email(), "full_name", req.fullName(), "role", "employee")));
                account = Params.of("username", username, "temporary_password", tempPassword);
            } catch (Exception e) { // không chặn onboarding nếu Keycloak lỗi
                log.warn("Không tạo được tài khoản SSO: {}", e.getMessage());
                userId = null;
                account = Params.of("error", "Chưa tạo được tài khoản SSO - hãy tạo thủ công trong Keycloak");
            }
        }

        String contractType = req.contractType() == null ? "probation" : req.contractType();
        LocalDate end = switch (contractType) {
            case "probation" -> req.hireDate().plusDays(60);
            case "fixed_term" -> req.hireDate().plusDays(730);
            default -> null;
        };
        int monthsLeft = 13 - req.hireDate().getMonthValue();
        Map<String, Object> employee = Params.of(
                "user_id", userId, "employee_code", code, "full_name", req.fullName(), "email", req.email(), "phone", req.phone(),
                "department", req.department(), "job_title", req.jobTitle(), "manager_id", blankToNull(req.managerId()),
                "hire_date", req.hireDate().toString(), "status", "onboarding",
                "dependents", req.dependents() == null ? 0 : req.dependents(),
                "contracts", Params.of("data", List.of(Params.of(
                        "contract_no", "HD-" + req.hireDate().getYear() + "-" + code.substring(2), "contract_type", contractType,
                        "start_date", req.hireDate().toString(), "end_date", end == null ? null : end.toString(),
                        "base_salary", req.baseSalary(), "allowance", req.allowance() == null ? 0 : req.allowance(), "status", "active"))),
                "leave_balances", Params.of("data", List.of(Params.of(
                        "year", req.hireDate().getYear(), "entitled_days", Math.round(12.0 * monthsLeft / 12)))));
        JsonNode created = hasura.query(OnboardingQueries.NEW_EMPLOYEE, Params.of("obj", employee)).get("insert_employees_one");
        String employeeId = created.get("id").asText();

        String managerUserId = null;
        if (blankToNull(req.managerId()) != null) {
            JsonNode m = hasura.query(OnboardingQueries.MANAGER, Params.of("id", req.managerId())).get("employees_by_pk");
            managerUserId = Json.text(m, "user_id");
        }
        Map<String, Object> payload = Params.of(
                "employee_id", employeeId, "employee_name", req.fullName(), "employee_user_id", userId,
                "manager_user_id", managerUserId, "hire_date", req.hireDate().toString(), "job_title", req.jobTitle());
        workflows.trigger("onboarding", payload, p -> insertDefaultTasks(p.get("employee_id").toString(), req.hireDate()));

        audit.record(user, "EMPLOYEE.CREATED", "employee", employeeId, Params.of(
                "employee_code", created.get("employee_code").asText(), "sso_account_created", userId != null,
                "contract_type", contractType));
        return new NewEmployeeResponse(employeeId, created.get("employee_code").asText(), account);
    }

    // ------------------------------------------------------------------ 2. Checklist
    /** Dùng bởi workflow n8n (qua /api/internal/onboarding-tasks) và bởi fallback. */
    public int insertTasks(String employeeId, List<TaskInput> tasks) {
        List<Map<String, Object>> objs = new ArrayList<>();
        for (TaskInput t : tasks) {
            objs.add(Params.of("employee_id", employeeId, "title", t.title(), "assignee_role", t.assigneeRole(), "due_date", t.dueDate()));
        }
        return hasura.query(OnboardingQueries.NEW_TASKS, Params.of("objs", objs)).get("insert_onboarding_tasks").get("affected_rows").asInt();
    }

    private void insertDefaultTasks(String employeeId, LocalDate hireDate) {
        List<TaskInput> tasks = new ArrayList<>();
        for (Object[] t : DEFAULT_TASKS) {
            tasks.add(new TaskInput((String) t[0], (String) t[1], hireDate.plusDays((Integer) t[2]).toString()));
        }
        insertTasks(employeeId, tasks);
    }

    public TaskResult completeTask(CurrentUser user, String taskId) {
        JsonNode t = hasura.query(OnboardingQueries.TASK, Params.of("id", taskId)).get("onboarding_tasks_by_pk");
        if (Json.isMissing(t)) throw ApiException.notFound("Không tìm thấy công việc");

        JsonNode emp = t.get("employee");
        String role = t.get("assignee_role").asText();
        boolean allowed = user.hasAny("hr", "admin")
                || ("manager".equals(role) && user.sub().equals(Json.text(emp.path("manager"), "user_id")))
                || ("employee".equals(role) && user.sub().equals(Json.text(emp, "user_id")));
        if (!allowed) throw ApiException.forbidden("Bạn không phải người phụ trách công việc này");

        hasura.query(OnboardingQueries.TASK_DONE, Params.of("id", taskId));
        return new TaskResult(taskId, "done");
    }

    private static String randomToken() {
        byte[] bytes = new byte[6];
        RANDOM.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    private static String blankToNull(String s) {
        return (s == null || s.isBlank()) ? null : s;
    }
}
