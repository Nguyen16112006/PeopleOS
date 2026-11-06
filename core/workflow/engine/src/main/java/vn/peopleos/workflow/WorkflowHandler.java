// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 PeopleOS contributors

package vn.peopleos.workflow;

import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;

@Service
public class WorkflowHandler {
    private final RestClient bff;
    private final String internalApiKey;
    private final String defaultTenantId;

    public WorkflowHandler(@Value("${peopleos.bff-url:http://bff:8000}") String bffUrl,
                           @Value("${peopleos.internal-api-key}") String internalApiKey,
                           @Value("${peopleos.default-tenant-id:00000000-0000-0000-0000-000000000001}") String defaultTenantId) {
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(5000);
        factory.setReadTimeout(10000);
        this.bff = RestClient.builder().baseUrl(bffUrl).requestFactory(factory).build();
        this.internalApiKey = internalApiKey;
        this.defaultTenantId = defaultTenantId;
    }

    public void execute(String activityId, Map<String, Object> payload, String tenantId) {
        String tenant = tenantId == null || tenantId.isBlank() ? defaultTenantId : tenantId;
        switch (activityId) {
            case "handleLeaveRequest" -> leaveRequest(payload, tenant);
            case "handleLeaveDecision" -> leaveDecision(payload, tenant);
            case "handleSalaryProposal" -> salaryProposal(payload, tenant);
            case "handleOnboarding" -> post("/api/internal/onboarding/initialize", payload, tenant);
            case "expireTempAccess" -> post("/api/internal/temp-access/expire", Map.of(), tenant);
            case "lockDueOffboarding" -> post("/api/internal/offboarding/lock-due", Map.of(), tenant);
            default -> throw new IllegalArgumentException("Không có xử lý cho BPMN task: " + activityId);
        }
    }

    private void leaveRequest(Map<String, Object> p, String tenant) {
        String stage = text(p, "stage");
        String manager = nullableText(p.get("manager_user_id"));
        String role = "hr".equals(stage) ? "hr" : "director".equals(stage) ? "director" : null;
        Map<String, Object> approver = target(manager != null && role == null ? "user_id" : "role",
                role == null ? (manager == null ? "hr" : manager) : role);
        String waiting = switch (stage) {
            case "hr" -> "HR kiểm tra ngày phép";
            case "director" -> "Giám đốc duyệt";
            default -> "quản lý duyệt";
        };
        String id = text(p, "request_id");
        String message = text(p, "employee_name") + " xin nghỉ " + text(p, "days") + " ngày ("
                + text(p, "start_date") + " → " + text(p, "end_date") + ").";
        notify(approver, "Đơn nghỉ phép chờ duyệt", message, "leave_request", id, "leave.pending", tenant);
        if (p.get("employee_user_id") != null) {
            notify(target("user_id", text(p, "employee_user_id")), "Đã gửi đơn nghỉ phép",
                    "Đơn của bạn đang chờ " + waiting + ".", "leave_request", id, "leave.submitted", tenant);
        }
    }

    private void leaveDecision(Map<String, Object> p, String tenant) {
        if (p.get("employee_user_id") == null) return;
        boolean approved = "approved".equals(p.get("decision"));
        String message = text(p, "approver_name") + (approved ? " đã duyệt" : " đã từ chối")
                + " đơn nghỉ " + text(p, "days") + " ngày (" + text(p, "start_date") + " → "
                + text(p, "end_date") + ").";
        if (p.get("note") != null && !text(p, "note").isBlank()) message += " Ghi chú: " + text(p, "note");
        notify(target("user_id", text(p, "employee_user_id")),
                approved ? "Đơn nghỉ phép đã được duyệt" : "Đơn nghỉ phép bị từ chối",
                message, "leave_request", text(p, "request_id"),
                approved ? "leave.approved" : "leave.rejected", tenant);
    }

    private void salaryProposal(Map<String, Object> p, String tenant) {
        String event = text(p, "event");
        String proposalId = text(p, "proposal_id");
        String amount = text(p, "employee_name") + ": "
                + ("raise".equals(p.get("proposal_type")) ? "lương cơ bản" : "phụ cấp") + " "
                + money(p.get("current_amount")) + " → " + money(p.get("proposed_amount"));
        switch (event) {
            case "created" -> notify(target("role", "hr"),
                    "Đề xuất tăng lương chờ HR thẩm định", amount,
                    "salary_proposal", proposalId, "proposal.pending_hr", tenant);
            case "step_approved" -> {
                String nextRole = text(p, "next_role");
                notify(target("role", nextRole), "Đề xuất tăng lương chờ bạn duyệt", amount,
                        "salary_proposal", proposalId, "proposal.pending_" + nextRole, tenant);
                notifyProposer(p, "Đề xuất đã qua cấp " + text(p, "actor_role"),
                        text(p, "actor_name") + " đã duyệt. " + amount,
                        "proposal.step_approved", tenant);
            }
            case "approved" -> {
                notifyProposer(p, "Đề xuất tăng lương đã được duyệt hoàn tất", amount,
                        "proposal.approved", tenant);
                notify(target("role", "hr"), "Điều chỉnh lương đã được áp dụng vào hợp đồng", amount,
                        "salary_proposal", proposalId, "proposal.applied", tenant);
                notify(target("role", "accountant"), "Áp dụng mức lương mới từ kỳ lương được chỉ định", amount,
                        "salary_proposal", proposalId, "proposal.applied_payroll", tenant);
            }
            case "rejected" -> notifyProposer(p, "Đề xuất tăng lương bị từ chối",
                    text(p, "actor_name") + " từ chối. " + amount
                            + (p.get("comment") == null ? "" : " Lý do: " + text(p, "comment")),
                    "proposal.rejected", tenant);
            default -> throw new IllegalArgumentException("Sự kiện đề xuất lương không hợp lệ: " + event);
        }
    }

    private void notifyProposer(Map<String, Object> p, String title, String message, String kind, String tenant) {
        if (p.get("proposer_user_id") != null) {
            notify(target("user_id", text(p, "proposer_user_id")), title, message,
                    "salary_proposal", text(p, "proposal_id"), kind, tenant);
        }
    }

    private void notify(Map<String, Object> target, String title, String message, String refType,
                        String refId, String kind, String tenant) {
        Map<String, Object> body = new LinkedHashMap<>(target);
        body.put("title", title);
        body.put("message", message);
        body.put("ref_type", refType);
        body.put("ref_id", refId);
        body.put("kind", kind);
        post("/api/internal/notify", body, tenant);
    }

    private void post(String path, Map<String, Object> body, String tenant) {
        bff.post().uri(path)
                .header("x-internal-key", internalApiKey)
                .header("x-tenant-id", tenant)
                .contentType(MediaType.APPLICATION_JSON)
                .body(body)
                .retrieve().toBodilessEntity();
    }

    private static Map<String, Object> target(String key, String value) {
        return Map.of(key, value);
    }

    private static String text(Map<String, Object> payload, String key) {
        Object value = payload.get(key);
        if (value == null) throw new IllegalArgumentException("Thiếu biến BPMN: " + key);
        return value.toString();
    }

    private static String nullableText(Object value) {
        return value == null || value.toString().isBlank() ? null : value.toString();
    }

    private static String money(Object value) {
        if (!(value instanceof Number number)) throw new IllegalArgumentException("Số tiền BPMN không hợp lệ");
        return String.format(Locale.US, "%,d", number.longValue()).replace(',', '.') + " đ";
    }
}
