// SPDX-License-Identifier: Apache-2.0
package vn.peopleos.bff.tempaccess;

import com.fasterxml.jackson.databind.JsonNode;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import org.springframework.stereotype.Service;
import vn.peopleos.bff.audit.AuditService;
import vn.peopleos.bff.common.ApiException;
import vn.peopleos.bff.common.Json;
import vn.peopleos.bff.common.Params;
import vn.peopleos.bff.employee.EmployeeLookup;
import vn.peopleos.bff.integration.hasura.HasuraClient;
import vn.peopleos.bff.notification.NotificationService;
import vn.peopleos.bff.notification.NotificationService.Target;
import vn.peopleos.bff.security.CurrentUser;
import vn.peopleos.bff.tempaccess.dto.CreateTempAccessRequest;
import vn.peopleos.bff.tempaccess.dto.TempAccessDecisionRequest;
import vn.peopleos.bff.tempaccess.dto.TempAccessResult;

/**
 * Cấp quyền tạm thời khi Admin kỹ thuật xử lý sự cố.
 *
 * <p>Admin tạo yêu cầu (phạm vi, lý do, thời hạn) → chủ sở hữu dữ liệu (HR hoặc Kế toán) VÀ Giám đốc cùng phê duyệt
 * → bản ghi chuyển sang approved với thời điểm hết hạn → hết hạn thì chuyển expired (hoặc thu hồi sớm: revoked).
 * Mọi bước đều ghi audit log. Người yêu cầu không được tự duyệt.
 *
 * <p>Lưu ý: dịch vụ này quản lý vòng đời bản ghi cấp quyền. Các API cần quyền tạm thời phải gọi
 * {@link #hasActiveGrant(String, String)} để kiểm tra trước khi cho Admin truy cập dữ liệu nhạy cảm.
 */
@Service
public class TempAccessService {
    private final HasuraClient hasura;
    private final EmployeeLookup employees;
    private final NotificationService notifications;
    private final AuditService audit;

    public TempAccessService(HasuraClient hasura, EmployeeLookup employees, NotificationService notifications, AuditService audit) {
        this.hasura = hasura;
        this.employees = employees;
        this.notifications = notifications;
        this.audit = audit;
    }

    // ------------------------------------------------------------------ 1. Tạo yêu cầu (chỉ Admin kỹ thuật)
    public TempAccessResult create(CurrentUser user, CreateTempAccessRequest req) {
        if (!user.isAdmin()) throw ApiException.forbidden("Chỉ Admin kỹ thuật được tạo yêu cầu cấp quyền tạm thời");
        JsonNode emp = employees.requireByUser(user.sub());

        JsonNode created = hasura.query(TempAccessQueries.INSERT, Params.of("obj", Params.of(
                "requester_id", emp.get("id").asText(), "scope", req.scope(), "data_owner_role", req.dataOwnerRole(),
                "reason", req.reason(), "duration_minutes", req.durationMinutes(), "status", "pending")))
                .get("insert_temp_access_requests_one");
        String id = created.get("id").asText();

        String msg = emp.get("full_name").asText() + " xin quyền tạm thời '" + req.scope() + "' trong "
                + req.durationMinutes() + " phút: " + req.reason();
        notifications.notify(Target.role(req.dataOwnerRole()), "Yêu cầu cấp quyền tạm thời chờ bạn duyệt", msg, "temp_access", id, "temp_access.pending");
        notifications.notify(Target.role("director"), "Yêu cầu cấp quyền tạm thời chờ Giám đốc duyệt", msg, "temp_access", id, "temp_access.pending");
        audit.record(user, "TEMP_ACCESS.REQUESTED", "temp_access_request", id,
                Params.of("scope", req.scope(), "data_owner_role", req.dataOwnerRole(), "duration_minutes", req.durationMinutes(), "reason", req.reason()));
        return new TempAccessResult(id, "pending", null);
    }

    // ------------------------------------------------------------------ 2. Duyệt / từ chối (chủ dữ liệu và Giám đốc)
    public TempAccessResult decide(CurrentUser user, String requestId, TempAccessDecisionRequest body) {
        JsonNode req = load(requestId);
        if (user.sub().equals(Json.text(req.get("requester"), "user_id"))) throw ApiException.forbidden("Không thể tự duyệt yêu cầu của chính mình");
        if (!"pending".equals(req.get("status").asText())) {
            throw ApiException.conflict("Yêu cầu đã ở trạng thái '" + req.get("status").asText() + "'");
        }

        String owner = req.get("data_owner_role").asText();
        boolean asDirector = user.isDirector();
        boolean asOwner = user.hasAny(owner);
        if (!asDirector && !asOwner) {
            throw ApiException.forbidden("Chỉ " + ("hr".equals(owner) ? "HR" : "Kế toán") + " (chủ dữ liệu) hoặc Giám đốc được duyệt yêu cầu này");
        }
        boolean ownerDone = !req.path("owner_approved_at").isNull() && !req.path("owner_approved_at").isMissingNode();
        boolean directorDone = !req.path("director_approved_at").isNull() && !req.path("director_approved_at").isMissingNode();
        if ((asDirector && directorDone) || (!asDirector && ownerDone)) throw ApiException.conflict("Bạn đã duyệt yêu cầu này rồi");

        JsonNode approver = employees.requireByUser(user.sub());
        String approverId = approver.get("id").asText();
        String stage = asDirector ? "director" : "data_owner";
        boolean approve = "approve".equals(body.decision());

        hasura.query(TempAccessQueries.EVENT, Params.of("obj", Params.of(
                "ref_type", "temp_access", "ref_id", requestId, "stage", stage, "actor_id", approverId,
                "decision", approve ? "approved" : "rejected", "comment", body.comment())));

        TempAccessResult result;
        if (!approve) {
            hasura.query(TempAccessQueries.SET_STATUS, Params.of("id", requestId, "status", "rejected"));
            result = new TempAccessResult(requestId, "rejected", null);
            notifications.notify(Target.user(Json.text(req.get("requester"), "user_id")), "Yêu cầu cấp quyền tạm thời bị từ chối",
                    "Yêu cầu quyền '" + req.get("scope").asText() + "' bị từ chối" + (body.comment() == null ? "." : ": " + body.comment()),
                    "temp_access", requestId, "temp_access.rejected");
        } else {
            hasura.query(asDirector ? TempAccessQueries.DIRECTOR_APPROVE : TempAccessQueries.OWNER_APPROVE,
                    Params.of("id", requestId, "aid", approverId));
            boolean both = asDirector ? ownerDone : directorDone;
            if (both) {
                Instant expires = Instant.now().plus(req.get("duration_minutes").asLong(), ChronoUnit.MINUTES);
                hasura.query(TempAccessQueries.GRANT, Params.of("id", requestId, "expires", expires.toString()));
                result = new TempAccessResult(requestId, "approved", expires.toString());
                notifications.notify(Target.user(Json.text(req.get("requester"), "user_id")), "Đã được cấp quyền tạm thời",
                        "Quyền '" + req.get("scope").asText() + "' có hiệu lực đến " + expires + ". Mọi thao tác được ghi audit log.",
                        "temp_access", requestId, "temp_access.granted");
                audit.record(user, "TEMP_ACCESS.GRANTED", "temp_access_request", requestId,
                        Params.of("scope", req.get("scope").asText(), "expires_at", expires.toString()));
            } else {
                result = new TempAccessResult(requestId, "pending", null);   // còn chờ bên còn lại
            }
        }
        audit.record(user, "TEMP_ACCESS." + (approve ? "APPROVED" : "REJECTED"), "temp_access_request", requestId,
                Params.of("stage", stage, "comment", body.comment()));
        return result;
    }

    // ------------------------------------------------------------------ 3. Thu hồi sớm (Giám đốc hoặc chính Admin yêu cầu)
    public TempAccessResult revoke(CurrentUser user, String requestId) {
        JsonNode req = load(requestId);
        boolean isRequester = user.sub().equals(Json.text(req.get("requester"), "user_id"));
        if (!user.isDirector() && !isRequester) throw ApiException.forbidden("Chỉ Giám đốc hoặc người yêu cầu được thu hồi quyền");
        if (!"approved".equals(req.get("status").asText())) throw ApiException.conflict("Chỉ quyền đang có hiệu lực mới thu hồi được");
        hasura.query(TempAccessQueries.REVOKE, Params.of("id", requestId));
        audit.record(user, "TEMP_ACCESS.REVOKED", "temp_access_request", requestId, Params.of("scope", req.get("scope").asText()));
        return new TempAccessResult(requestId, "revoked", null);
    }

    // ------------------------------------------------------------------ 4. Hết hạn và kiểm tra quyền đang hiệu lực
    /** Chuyển các quyền đã quá hạn sang expired. Gọi định kỳ (ví dụ n8n gọi mỗi phút) hoặc trước khi kiểm tra quyền. */
    public int expireOverdue() {
        JsonNode r = hasura.query(TempAccessQueries.EXPIRE_OVERDUE, Params.of("now", Instant.now().toString()))
                .path("update_temp_access_requests");
        return r.path("affected_rows").asInt(0);
    }

    /** True nếu nhân viên (requester) đang có quyền tạm thời còn hiệu lực cho phạm vi {@code scope}. */
    public boolean hasActiveGrant(String employeeId, String scope) {
        JsonNode rows = hasura.query(TempAccessQueries.ACTIVE_GRANT,
                Params.of("rid", employeeId, "scope", scope, "now", Instant.now().toString())).path("temp_access_requests");
        return rows.isArray() && !rows.isEmpty();
    }

    private JsonNode load(String id) {
        JsonNode req = hasura.query(TempAccessQueries.BY_ID, Params.of("id", id)).get("temp_access_requests_by_pk");
        if (Json.isMissing(req)) throw ApiException.notFound("Không tìm thấy yêu cầu");
        return req;
    }
}
