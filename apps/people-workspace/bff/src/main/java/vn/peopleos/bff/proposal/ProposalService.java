package vn.peopleos.bff.proposal;

import com.fasterxml.jackson.databind.JsonNode;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import org.springframework.stereotype.Service;
import vn.peopleos.bff.audit.AuditService;
import vn.peopleos.bff.common.ApiException;
import vn.peopleos.bff.common.Json;
import vn.peopleos.bff.common.Params;
import vn.peopleos.bff.employee.EmployeeLookup;
import vn.peopleos.bff.integration.hasura.HasuraClient;
import vn.peopleos.bff.integration.n8n.WorkflowClient;
import vn.peopleos.bff.notification.NotificationService;
import vn.peopleos.bff.notification.NotificationService.Target;
import vn.peopleos.bff.proposal.dto.CreateProposalRequest;
import vn.peopleos.bff.proposal.dto.ProposalDecisionRequest;
import vn.peopleos.bff.proposal.dto.ProposalResult;
import vn.peopleos.bff.security.CurrentUser;

/**
 * Đề xuất tăng lương/phụ cấp - duyệt nhiều cấp: Quản lý đề xuất → HR (bước 1) → Giám đốc/Admin (bước 2).
 *
 * <p>Từ chối ở bất kỳ cấp nào thì kết thúc. Duyệt xong cấp cuối thì tự cập nhật mức lương/phụ cấp
 * vào hợp đồng đang hiệu lực. Lịch sử từng cấp lưu ở bảng approval_steps.
 */
@Service
public class ProposalService {
    private static final String WORKFLOW = "salary-proposal";

    private final HasuraClient hasura;
    private final EmployeeLookup employees;
    private final WorkflowClient workflows;
    private final NotificationService notifications;
    private final AuditService audit;

    public ProposalService(HasuraClient hasura, EmployeeLookup employees, WorkflowClient workflows,
                           NotificationService notifications, AuditService audit) {
        this.audit = audit;
        this.hasura = hasura;
        this.employees = employees;
        this.workflows = workflows;
        this.notifications = notifications;
    }

    // ------------------------------------------------------------------ 1. Tạo đề xuất
    public ProposalResult create(CurrentUser user, CreateProposalRequest req) {
        if (!user.hasAny("manager", "hr", "admin")) throw ApiException.forbidden("Cần một trong các vai trò: manager, hr, admin");

        JsonNode target = hasura.query(ProposalQueries.TARGET, Params.of("id", req.employeeId())).get("employees_by_pk");
        if (Json.isMissing(target)) throw ApiException.notFound("Không tìm thấy nhân viên");
        if (user.sub().equals(Json.text(target, "user_id"))) {
            throw ApiException.forbidden("Không thể tự đề xuất tăng lương cho chính mình");
        }
        boolean isTeamManager = user.sub().equals(Json.text(target.path("manager"), "user_id"));
        if (!user.hasAny("hr", "admin") && !isTeamManager) {
            throw ApiException.forbidden("Quản lý chỉ được đề xuất cho nhân viên thuộc nhóm của mình");
        }
        JsonNode contract = Json.first(target.get("contracts"));
        if (contract == null) throw ApiException.badRequest("Nhân viên chưa có hợp đồng đang hiệu lực");

        String column = "raise".equals(req.proposalType()) ? "base_salary" : "allowance";
        long current = contract.get(column).asLong();
        if (req.proposedAmount() <= current) {
            throw ApiException.badRequest("Mức đề xuất phải lớn hơn mức hiện tại (" + money(current) + ")");
        }
        JsonNode proposer = employees.requireByUser(user.sub());

        Map<String, Object> obj = Params.of(
                "employee_id", target.get("id").asText(), "proposer_id", proposer.get("id").asText(),
                "proposal_type", req.proposalType(), "current_amount", current, "proposed_amount", req.proposedAmount(),
                "reason", req.reason(), "effective_date", req.effectiveDate() == null ? null : req.effectiveDate().toString(),
                "status", "pending_hr",
                "approval_steps", Params.of("data", List.of(
                        Params.of("step_order", 1, "approver_role", "hr", "status", "pending"),
                        Params.of("step_order", 2, "approver_role", "admin", "status", "waiting"))));
        String id = hasura.query(ProposalQueries.CREATE, Params.of("obj", obj)).get("insert_salary_proposals_one").get("id").asText();

        workflows.trigger(WORKFLOW, Params.of(
                "event", "created", "proposal_id", id, "employee_name", target.get("full_name").asText(),
                "proposer_user_id", user.sub(), "proposal_type", req.proposalType(), "current_amount", current,
                "proposed_amount", req.proposedAmount(), "actor_name", user.name(), "actor_role", user.role()), this::notifyFallback);
        audit.record(user, "SALARY_PROPOSAL.CREATED", "salary_proposal", id, Params.of(
                "employee", target.get("full_name").asText(), "type", req.proposalType(),
                "from", current, "to", req.proposedAmount()));
        return new ProposalResult(id, "pending_hr");
    }

    // ------------------------------------------------------------------ 2. Duyệt / từ chối một cấp
    public ProposalResult decide(CurrentUser user, String proposalId, ProposalDecisionRequest body) {
        JsonNode p = hasura.query(ProposalQueries.BY_ID, Params.of("id", proposalId)).get("salary_proposals_by_pk");
        if (Json.isMissing(p)) throw ApiException.notFound("Không tìm thấy đề xuất");
        String status = p.get("status").asText();
        if ("approved".equals(status) || "rejected".equals(status)) {
            throw ApiException.conflict("Đề xuất đã ở trạng thái '" + status + "'");
        }

        JsonNode steps = p.get("approval_steps");
        JsonNode current = null;
        for (JsonNode s : steps) {
            if ("pending".equals(s.get("status").asText())) { current = s; break; }
        }
        if (current == null) throw ApiException.conflict("Đề xuất không có bước duyệt nào đang chờ");

        String stepRole = current.get("approver_role").asText();
        // HR chỉ duyệt bước HR; Admin (Giám đốc) duyệt được mọi bước
        if (!(user.hasAny("admin") || user.hasAny(stepRole))) {
            throw ApiException.forbidden("Bước hiện tại cần vai trò '" + stepRole + "' duyệt");
        }
        String proposerUser = Json.text(p.get("proposer"), "user_id");
        String employeeUser = Json.text(p.get("employee"), "user_id");
        if (user.sub().equals(proposerUser) || user.sub().equals(employeeUser)) {
            throw ApiException.forbidden("Không thể tự duyệt đề xuất liên quan đến chính mình");
        }

        JsonNode actor = employees.findByUser(user.sub());
        boolean approve = "approve".equals(body.decision());
        hasura.query(ProposalQueries.DECIDE_STEP, Params.of("id", current.get("id").asText(),
                "status", approve ? "approved" : "rejected",
                "approver", actor == null ? null : actor.get("id").asText(), "comment", body.comment()));

        Map<String, Object> base = Params.of(
                "proposal_id", proposalId, "employee_name", p.get("employee").get("full_name").asText(),
                "proposer_user_id", proposerUser, "proposal_type", p.get("proposal_type").asText(),
                "current_amount", p.get("current_amount").asLong(), "proposed_amount", p.get("proposed_amount").asLong(),
                "actor_name", actor == null ? user.name() : actor.get("full_name").asText(),
                "actor_role", stepRole, "comment", body.comment());

        if (!approve) {                                                   // từ chối -> kết thúc
            setStatus(proposalId, "rejected");
            trigger(base, "rejected", null);
            auditDecision(user, proposalId, "REJECTED", stepRole, body.comment());
            return new ProposalResult(proposalId, "rejected");
        }

        JsonNode next = null;                                             // còn cấp tiếp theo?
        for (JsonNode s : steps) {
            if (s.get("step_order").asInt() > current.get("step_order").asInt()) { next = s; break; }
        }
        if (next != null) {
            hasura.query(ProposalQueries.STEP_STATUS, Params.of("id", next.get("id").asText(), "status", "pending"));
            String nextRole = next.get("approver_role").asText();
            String newStatus = "pending_" + nextRole;
            setStatus(proposalId, newStatus);
            trigger(base, "step_approved", nextRole);
            auditDecision(user, proposalId, "STEP_APPROVED", stepRole, body.comment());
            return new ProposalResult(proposalId, newStatus);
        }

        setStatus(proposalId, "approved");                                // cấp cuối -> áp dụng vào hợp đồng
        applyToContract(p);
        trigger(base, "approved", null);
        auditDecision(user, proposalId, "APPROVED", stepRole, body.comment());
        return new ProposalResult(proposalId, "approved");
    }

    // ------------------------------------------------------------------ hỗ trợ
    private void applyToContract(JsonNode p) {
        JsonNode contract = Json.first(hasura.query(ProposalQueries.ACTIVE_CONTRACT,
                Params.of("eid", p.get("employee_id").asText())).get("contracts"));
        if (contract == null) return;
        String column = "raise".equals(p.get("proposal_type").asText()) ? "base_salary" : "allowance";
        hasura.query(ProposalQueries.APPLY.formatted(column),
                Params.of("id", contract.get("id").asText(), "v", p.get("proposed_amount").asLong()));
    }

    private void auditDecision(CurrentUser user, String proposalId, String outcome, String stepRole, String comment) {
        audit.record(user, "SALARY_PROPOSAL." + outcome, "salary_proposal", proposalId,
                Params.of("step_role", stepRole, "comment", comment));
    }

    private void setStatus(String proposalId, String status) {
        hasura.query(ProposalQueries.PROPOSAL_STATUS, Params.of("id", proposalId, "status", status));
    }

    private void trigger(Map<String, Object> base, String event, String nextRole) {
        Map<String, Object> payload = new java.util.LinkedHashMap<>(base);
        payload.put("event", event);
        if (nextRole != null) payload.put("next_role", nextRole);
        workflows.trigger(WORKFLOW, payload, this::notifyFallback);
    }

    /** Dự phòng khi n8n không chạy: thông báo tối thiểu cho người liên quan. */
    private void notifyFallback(Map<String, Object> p) {
        String delta = p.get("employee_name") + ": " + money(((Number) p.get("current_amount")).longValue())
                + " → " + money(((Number) p.get("proposed_amount")).longValue());
        String event = (String) p.get("event");
        String id = String.valueOf(p.get("proposal_id"));
        Object proposerUser = p.get("proposer_user_id");
        switch (event) {
            case "created" -> notifications.notify(Target.role("hr"), "Đề xuất tăng lương chờ HR duyệt", delta,
                    "salary_proposal", id, "proposal.pending_hr");
            case "step_approved" -> notifications.notify(Target.role((String) p.get("next_role")),
                    "Đề xuất tăng lương chờ bạn duyệt", delta, "salary_proposal", id, null);
            default -> {
                if (proposerUser != null) {
                    String title = "approved".equals(event) ? "Đề xuất tăng lương đã được duyệt hoàn tất" : "Đề xuất tăng lương bị từ chối";
                    notifications.notify(Target.user(proposerUser.toString()), title, delta, "salary_proposal", id, "proposal." + event);
                }
            }
        }
    }

    private static String money(long amount) {
        return String.format(Locale.US, "%,d", amount).replace(',', '.') + " đ";
    }
}
