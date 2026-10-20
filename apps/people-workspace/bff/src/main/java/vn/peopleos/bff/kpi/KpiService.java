package vn.peopleos.bff.kpi;

import com.fasterxml.jackson.databind.JsonNode;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.springframework.stereotype.Service;
import vn.peopleos.bff.audit.AuditService;
import vn.peopleos.bff.common.ApiException;
import vn.peopleos.bff.common.Json;
import vn.peopleos.bff.common.Params;
import vn.peopleos.bff.employee.EmployeeLookup;
import vn.peopleos.bff.integration.hasura.HasuraClient;
import vn.peopleos.bff.kpi.dto.AddGoalRequest;
import vn.peopleos.bff.kpi.dto.CycleDecisionRequest;
import vn.peopleos.bff.kpi.dto.EvaluateRequest;
import vn.peopleos.bff.kpi.dto.FeedbackRequest;
import vn.peopleos.bff.kpi.dto.GoalScore;
import vn.peopleos.bff.kpi.dto.KpiResult;
import vn.peopleos.bff.kpi.dto.OpenCycleRequest;
import vn.peopleos.bff.notification.NotificationService;
import vn.peopleos.bff.notification.NotificationService.Target;
import vn.peopleos.bff.security.CurrentUser;

/**
 * Đánh giá hiệu suất (KPI) theo quý.
 *
 * <p>HR mở chu kỳ → quản lý trực tiếp giao mục tiêu (Giám đốc giao cho Quản lý/HR/Kế toán/Admin) → quản lý trực tiếp chấm
 * mức hoàn thành từng mục tiêu (không có bước nhân viên tự đánh giá) → HR tổng hợp, rà soát (chu kỳ sang review)
 * → Giám đốc duyệt (approved) hoặc trả lại (open) → nhân viên xem kết quả và phản hồi. Người đánh giá luôn là
 * quản lý trực tiếp, nên không ai tự đánh giá mình.
 */
@Service
public class KpiService {
    private final HasuraClient hasura;
    private final EmployeeLookup employees;
    private final NotificationService notifications;
    private final AuditService audit;

    public KpiService(HasuraClient hasura, EmployeeLookup employees, NotificationService notifications, AuditService audit) {
        this.hasura = hasura;
        this.employees = employees;
        this.notifications = notifications;
        this.audit = audit;
    }

    // ------------------------------------------------------------------ quy tắc tính điểm (thuần, dễ kiểm thử)
    /** Điểm tổng = Σ(trọng số × mức hoàn thành) / 100, làm tròn 1 chữ số thập phân. */
    static double weightedScore(List<int[]> weightAndAchievement) {
        double sum = 0;
        for (int[] p : weightAndAchievement) sum += (double) p[0] * p[1];
        return Math.round(sum / 100.0 * 10.0) / 10.0;
    }

    /** Xếp loại theo điểm: từ 90 xuất sắc, từ 75 tốt, từ 60 đạt, dưới 60 cần cải thiện. */
    static String ratingFor(double score) {
        if (score >= 90) return "excellent";
        if (score >= 75) return "good";
        if (score >= 60) return "meets";
        return "needs_improvement";
    }

    /** Hai ngày đầu/cuối của quý. */
    static LocalDate quarterStart(int year, int quarter) {
        return LocalDate.of(year, (quarter - 1) * 3 + 1, 1);
    }

    static LocalDate quarterEnd(int year, int quarter) {
        return quarterStart(year, quarter).plusMonths(3).minusDays(1);
    }

    // ------------------------------------------------------------------ 1. HR mở chu kỳ
    public KpiResult openCycle(CurrentUser user, OpenCycleRequest req) {
        if (!user.isHr()) throw ApiException.forbidden("Chỉ HR được mở chu kỳ đánh giá");
        JsonNode exists = hasura.query(KpiQueries.CYCLE_EXISTS, Params.of("year", req.year(), "quarter", req.quarter())).path("kpi_cycles");
        if (exists.isArray() && !exists.isEmpty()) throw ApiException.conflict("Chu kỳ Q" + req.quarter() + "/" + req.year() + " đã tồn tại");
        JsonNode hr = employees.requireByUser(user.sub());
        JsonNode created = hasura.query(KpiQueries.CYCLE_INSERT, Params.of("obj", Params.of(
                "name", "KPI Q" + req.quarter() + "/" + req.year(), "year", req.year(), "quarter", req.quarter(),
                "start_date", quarterStart(req.year(), req.quarter()).toString(), "end_date", quarterEnd(req.year(), req.quarter()).toString(),
                "status", "open", "created_by", hr.get("id").asText()))).get("insert_kpi_cycles_one");
        String id = created.get("id").asText();
        String msg = "Chu kỳ KPI Q" + req.quarter() + "/" + req.year() + " đã mở: hãy giao mục tiêu cho người trong nhóm của bạn.";
        notifications.notify(Target.role("director"), "Chu kỳ KPI mới", msg, "kpi_cycle", id, "kpi.cycle_open");
        notifications.notify(Target.role("manager"), "Chu kỳ KPI mới", msg, "kpi_cycle", id, "kpi.cycle_open");
        audit.record(user, "KPI.CYCLE_OPENED", "kpi_cycle", id, Params.of("year", req.year(), "quarter", req.quarter()));
        return KpiResult.of(id, "open");
    }

    // ------------------------------------------------------------------ 2. Giao mục tiêu
    public KpiResult addGoal(CurrentUser user, AddGoalRequest req) {
        requireOpenCycle(req.cycleId());
        JsonNode target = requireDirectReport(user, req.employeeId());
        JsonNode existing = hasura.query(KpiQueries.GOALS_OF, Params.of("cid", req.cycleId(), "eid", req.employeeId())).path("kpi_goals");
        int total = 0;
        for (JsonNode g : existing) total += g.get("weight").asInt();
        if (total + req.weight() > 100) throw ApiException.conflict("Tổng trọng số vượt 100 (hiện " + total + ", thêm " + req.weight() + ")");
        JsonNode creator = employees.requireByUser(user.sub());
        String id = hasura.query(KpiQueries.GOAL_INSERT, Params.of("obj", Params.of(
                "cycle_id", req.cycleId(), "employee_id", req.employeeId(), "title", req.title(),
                "description", req.description(), "target", req.target(), "weight", req.weight(),
                "created_by", creator.get("id").asText()))).get("insert_kpi_goals_one").get("id").asText();
        notifications.notify(Target.user(Json.text(target, "user_id")), "Bạn có mục tiêu KPI mới",
                "\"" + req.title() + "\" (trọng số " + req.weight() + "%).", "kpi_goal", id, "kpi.goal_assigned");
        audit.record(user, "KPI.GOAL_ASSIGNED", "kpi_goal", id,
                Params.of("employee", target.get("full_name").asText(), "title", req.title(), "weight", req.weight()));
        return KpiResult.of(id, "assigned");
    }

    public KpiResult removeGoal(CurrentUser user, String goalId) {
        JsonNode g = hasura.query(KpiQueries.GOAL_BY_ID, Params.of("id", goalId)).get("kpi_goals_by_pk");
        if (Json.isMissing(g)) throw ApiException.notFound("Không tìm thấy mục tiêu");
        if (!"open".equals(g.path("cycle").path("status").asText())) throw ApiException.conflict("Chu kỳ không còn mở, không sửa được mục tiêu");
        if (!user.sub().equals(Json.text(g.path("employee").path("manager"), "user_id"))) {
            throw ApiException.forbidden("Chỉ quản lý trực tiếp được xóa mục tiêu đã giao");
        }
        hasura.query(KpiQueries.GOAL_DELETE, Params.of("id", goalId));
        audit.record(user, "KPI.GOAL_REMOVED", "kpi_goal", goalId, Params.of("title", g.get("title").asText()));
        return KpiResult.of(goalId, "removed");
    }

    // ------------------------------------------------------------------ 3. Quản lý trực tiếp đánh giá
    public KpiResult evaluate(CurrentUser user, EvaluateRequest req) {
        requireOpenCycle(req.cycleId());
        JsonNode target = requireDirectReport(user, req.employeeId());
        JsonNode goals = hasura.query(KpiQueries.GOALS_OF, Params.of("cid", req.cycleId(), "eid", req.employeeId())).path("kpi_goals");
        if (!goals.isArray() || goals.isEmpty()) throw ApiException.conflict("Chưa giao mục tiêu KPI nào cho nhân viên này");
        Map<String, Integer> weights = new HashMap<>();
        int total = 0;
        for (JsonNode g : goals) { weights.put(g.get("id").asText(), g.get("weight").asInt()); total += g.get("weight").asInt(); }
        if (total != 100) throw ApiException.conflict("Tổng trọng số mục tiêu phải bằng 100 trước khi đánh giá (hiện " + total + ")");

        Set<String> seen = new HashSet<>();
        List<int[]> pairs = new ArrayList<>();
        List<Map<String, Object>> stored = new ArrayList<>();
        for (GoalScore s : req.scores()) {
            Integer weight = weights.get(s.goalId());
            if (weight == null) throw ApiException.badRequest("Mục tiêu không thuộc nhân viên/chu kỳ này: " + s.goalId());
            if (!seen.add(s.goalId())) throw ApiException.badRequest("Mục tiêu bị chấm trùng: " + s.goalId());
            pairs.add(new int[] {weight, s.achievement()});
            stored.add(Params.of("goalId", s.goalId(), "achievement", s.achievement()));
        }
        if (seen.size() != weights.size()) throw ApiException.badRequest("Cần chấm đủ " + weights.size() + " mục tiêu");

        double score = weightedScore(pairs);
        String rating = ratingFor(score);
        JsonNode evaluator = employees.requireByUser(user.sub());
        JsonNode saved = hasura.query(KpiQueries.EVAL_UPSERT, Params.of("obj", Params.of(
                "cycle_id", req.cycleId(), "employee_id", req.employeeId(), "evaluator_id", evaluator.get("id").asText(),
                "goal_scores", stored, "score", score, "rating", rating, "comment", req.comment(), "status", "submitted")))
                .get("insert_kpi_evaluations_one");
        String id = saved.get("id").asText();
        audit.record(user, "KPI.EVALUATED", "kpi_evaluation", id,
                Params.of("employee", target.get("full_name").asText(), "score", score, "rating", rating));
        return new KpiResult(id, "submitted", score, rating);
    }

    // ------------------------------------------------------------------ 4. HR tổng hợp
    public KpiResult consolidate(CurrentUser user, String cycleId) {
        if (!user.isHr()) throw ApiException.forbidden("Chỉ HR được tổng hợp kết quả đánh giá");
        JsonNode cycle = requireOpenCycle(cycleId);
        JsonNode expected = hasura.query(KpiQueries.EXPECTED_EMPLOYEES, Params.of("end", cycle.get("end_date").asText())).path("employees");
        Set<String> done = new HashSet<>();
        for (JsonNode e : hasura.query(KpiQueries.EVALS_OF_CYCLE, Params.of("cid", cycleId)).path("kpi_evaluations")) done.add(e.get("employee_id").asText());
        List<String> missing = new ArrayList<>();
        for (JsonNode e : expected) if (!done.contains(e.get("id").asText())) missing.add(e.get("full_name").asText());
        if (!missing.isEmpty()) {
            throw ApiException.conflict("Còn " + missing.size() + " người chưa được đánh giá: " + String.join(", ", missing.subList(0, Math.min(5, missing.size()))) + (missing.size() > 5 ? "…" : ""));
        }
        hasura.query(KpiQueries.EVALS_STATUS, Params.of("cid", cycleId, "from", "submitted", "to", "consolidated"));
        hasura.query(KpiQueries.CYCLE_STATUS, Params.of("id", cycleId, "status", "review"));
        notifications.notify(Target.role("director"), "Kết quả KPI chờ Giám đốc duyệt",
                cycle.get("name").asText() + ": HR đã tổng hợp " + done.size() + " đánh giá.", "kpi_cycle", cycleId, "kpi.review");
        audit.record(user, "KPI.CONSOLIDATED", "kpi_cycle", cycleId, Params.of("evaluations", done.size()));
        return KpiResult.of(cycleId, "review");
    }

    // ------------------------------------------------------------------ 5. Giám đốc duyệt / trả lại
    public KpiResult approve(CurrentUser user, String cycleId) {
        if (!user.isDirector()) throw ApiException.forbidden("Chỉ Giám đốc được duyệt kết quả đánh giá");
        JsonNode cycle = requireCycle(cycleId);
        if (!"review".equals(cycle.get("status").asText())) throw ApiException.conflict("Chu kỳ chưa ở bước chờ Giám đốc duyệt");
        hasura.query(KpiQueries.EVALS_STATUS, Params.of("cid", cycleId, "from", "consolidated", "to", "approved"));
        hasura.query(KpiQueries.CYCLE_STATUS, Params.of("id", cycleId, "status", "approved"));
        for (JsonNode e : hasura.query(KpiQueries.EVALS_OF_CYCLE, Params.of("cid", cycleId)).path("kpi_evaluations")) {
            String uid = Json.text(e.path("employee"), "user_id");
            if (uid != null) notifications.notify(Target.user(uid), "Kết quả KPI " + cycle.get("name").asText() + " đã có",
                    "Bạn có thể xem kết quả và gửi phản hồi.", "kpi_evaluation", e.get("id").asText(), "kpi.result");
        }
        notifications.notify(Target.role("hr"), "Kết quả KPI đã được duyệt", cycle.get("name").asText() + " đã được Giám đốc duyệt.", "kpi_cycle", cycleId, "kpi.approved");
        audit.record(user, "KPI.APPROVED", "kpi_cycle", cycleId, Params.of("cycle", cycle.get("name").asText()));
        return KpiResult.of(cycleId, "approved");
    }

    public KpiResult returnCycle(CurrentUser user, String cycleId, CycleDecisionRequest body) {
        if (!user.isDirector()) throw ApiException.forbidden("Chỉ Giám đốc được trả lại kết quả đánh giá");
        JsonNode cycle = requireCycle(cycleId);
        if (!"review".equals(cycle.get("status").asText())) throw ApiException.conflict("Chu kỳ chưa ở bước chờ Giám đốc duyệt");
        hasura.query(KpiQueries.EVALS_STATUS, Params.of("cid", cycleId, "from", "consolidated", "to", "submitted"));
        hasura.query(KpiQueries.CYCLE_STATUS, Params.of("id", cycleId, "status", "open"));
        String comment = body == null ? null : body.comment();
        notifications.notify(Target.role("hr"), "Giám đốc trả lại kết quả KPI",
                cycle.get("name").asText() + (comment == null ? "." : ": " + comment), "kpi_cycle", cycleId, "kpi.returned");
        audit.record(user, "KPI.RETURNED", "kpi_cycle", cycleId, Params.of("comment", comment));
        return KpiResult.of(cycleId, "open");
    }

    // ------------------------------------------------------------------ 6. Nhân viên phản hồi
    public KpiResult feedback(CurrentUser user, String evaluationId, FeedbackRequest body) {
        JsonNode e = hasura.query(KpiQueries.EVAL_BY_ID, Params.of("id", evaluationId)).get("kpi_evaluations_by_pk");
        if (Json.isMissing(e)) throw ApiException.notFound("Không tìm thấy đánh giá");
        if (!user.sub().equals(Json.text(e.get("employee"), "user_id"))) throw ApiException.forbidden("Chỉ người được đánh giá mới phản hồi được");
        if (!"approved".equals(e.get("status").asText())) throw ApiException.conflict("Chỉ phản hồi được sau khi kết quả được duyệt");
        hasura.query(KpiQueries.EVAL_FEEDBACK, Params.of("id", evaluationId, "text", body.feedback()));
        notifications.notify(Target.role("hr"), "Nhân viên phản hồi kết quả KPI", e.get("employee").get("full_name").asText() + " đã gửi phản hồi.",
                "kpi_evaluation", evaluationId, "kpi.feedback");
        audit.record(user, "KPI.FEEDBACK", "kpi_evaluation", evaluationId, Params.of("length", body.feedback().length()));
        return KpiResult.of(evaluationId, "approved");
    }

    // ------------------------------------------------------------------ helper
    private JsonNode requireCycle(String id) {
        JsonNode c = hasura.query(KpiQueries.CYCLE_BY_ID, Params.of("id", id)).get("kpi_cycles_by_pk");
        if (Json.isMissing(c)) throw ApiException.notFound("Không tìm thấy chu kỳ đánh giá");
        return c;
    }

    private JsonNode requireOpenCycle(String id) {
        JsonNode c = requireCycle(id);
        if (!"open".equals(c.get("status").asText())) throw ApiException.conflict("Chu kỳ không còn mở (trạng thái '" + c.get("status").asText() + "')");
        return c;
    }

    /** Chỉ quản lý trực tiếp được giao/đánh giá; không ai thao tác trên chính mình. */
    private JsonNode requireDirectReport(CurrentUser user, String employeeId) {
        JsonNode e = hasura.query(KpiQueries.EMPLOYEE, Params.of("id", employeeId)).get("employees_by_pk");
        if (Json.isMissing(e)) throw ApiException.notFound("Không tìm thấy nhân viên");
        if (user.sub().equals(Json.text(e, "user_id"))) throw ApiException.forbidden("Không thể giao hay đánh giá KPI cho chính mình");
        if (!user.sub().equals(Json.text(e.path("manager"), "user_id"))) throw ApiException.forbidden("Chỉ quản lý trực tiếp của nhân viên được giao và đánh giá KPI");
        if ("terminated".equals(e.get("status").asText())) throw ApiException.conflict("Nhân viên đã nghỉ việc");
        return e;
    }
}
