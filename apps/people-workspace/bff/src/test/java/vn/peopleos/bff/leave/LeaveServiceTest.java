package vn.peopleos.bff.leave;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.LocalDate;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.http.HttpStatus;
import vn.peopleos.bff.audit.AuditService;
import vn.peopleos.bff.common.ApiException;
import vn.peopleos.bff.employee.EmployeeLookup;
import vn.peopleos.bff.integration.hasura.HasuraClient;
import vn.peopleos.bff.integration.n8n.WorkflowClient;
import vn.peopleos.bff.leave.dto.CreateLeaveRequest;
import vn.peopleos.bff.leave.dto.LeaveDecisionRequest;
import vn.peopleos.bff.leave.dto.LeaveResult;
import vn.peopleos.bff.notification.NotificationService;
import vn.peopleos.bff.security.CurrentUser;

@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class LeaveServiceTest {
    @Mock HasuraClient hasura;
    @Mock EmployeeLookup employees;
    @Mock WorkflowClient workflows;
    @Mock NotificationService notifications;
    @Mock AuditService audit;
    @InjectMocks LeaveService service;

    private static final ObjectMapper MAPPER = new ObjectMapper();
    private final CurrentUser dung = new CurrentUser("u-dung", "employee", "Phạm Thu Dung", "", List.of("employee"));
    private final CurrentUser cuong = new CurrentUser("u-cuong", "manager", "Lê Minh Cường", "", List.of("manager", "employee"));

    private static JsonNode json(String s) {
        try {
            return MAPPER.readTree(s);
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    private static final String EMP_DUNG = """
            {"id":"e-dung","user_id":"u-dung","full_name":"Phạm Thu Dung","manager":{"id":"e-cuong","user_id":"u-cuong"}}""";

    private static CreateLeaveRequest annual(String from, String to) {
        return new CreateLeaveRequest("annual", LocalDate.parse(from), LocalDate.parse(to), "Nghỉ phép năm");
    }

    private void stubLeaveRequest(String status) {
        when(hasura.query(eq(LeaveQueries.BY_ID), any())).thenReturn(json("""
                {"leave_requests_by_pk":{"id":"L1","status":"%s","leave_type":"annual","days":2,
                 "start_date":"2026-10-19","end_date":"2026-10-20","employee_id":"e-dung",
                 "employee":{"id":"e-dung","user_id":"u-dung","full_name":"Phạm Thu Dung","manager":{"user_id":"u-cuong"}}}}
                """.formatted(status)));
    }

    @Test
    void createsLeaveAndTriggersWorkflow() {
        when(employees.requireByUser("u-dung")).thenReturn(json(EMP_DUNG));
        when(hasura.query(eq(LeaveQueries.CHECK), any())).thenReturn(json(
                "{\"leave_balances\":[{\"entitled_days\":12,\"used_days\":2}],\"pending\":[],\"overlap\":[]}"));
        when(hasura.query(eq(LeaveQueries.INSERT), any())).thenReturn(json(
                "{\"insert_leave_requests_one\":{\"id\":\"L1\",\"status\":\"pending\",\"days\":2}}"));

        LeaveResult r = service.create(dung, annual("2026-10-19", "2026-10-20"));

        assertEquals("L1", r.id());
        assertEquals(2, r.days());
        verify(workflows).trigger(eq("leave-request"), any(), any());
    }

    @Test
    void rejectsWhenAnnualBalanceExceeded() {
        when(employees.requireByUser("u-dung")).thenReturn(json(EMP_DUNG));
        when(hasura.query(eq(LeaveQueries.CHECK), any())).thenReturn(json(
                "{\"leave_balances\":[{\"entitled_days\":12,\"used_days\":11}],\"pending\":[{\"days\":0.5}],\"overlap\":[]}"));

        ApiException e = assertThrows(ApiException.class, () -> service.create(dung, annual("2026-10-19", "2026-10-20")));

        assertEquals(HttpStatus.BAD_REQUEST, e.status());
        verify(hasura, never()).query(eq(LeaveQueries.INSERT), any());
        verify(workflows, never()).trigger(any(), any(), any());
    }

    @Test
    void rejectsOverlappingRequest() {
        when(employees.requireByUser("u-dung")).thenReturn(json(EMP_DUNG));
        when(hasura.query(eq(LeaveQueries.CHECK), any())).thenReturn(json(
                "{\"leave_balances\":[],\"pending\":[],\"overlap\":[{\"id\":\"x\"}]}"));

        ApiException e = assertThrows(ApiException.class, () -> service.create(dung, annual("2026-10-19", "2026-10-20")));
        assertEquals(HttpStatus.CONFLICT, e.status());
    }

    @Test
    void rejectsRangeWithoutWorkingDays() {
        ApiException e = assertThrows(ApiException.class, () -> service.create(dung, annual("2026-10-17", "2026-10-18")));
        assertEquals(HttpStatus.BAD_REQUEST, e.status());
    }

    @Test
    void onlyDirectManagerCanDecide() {
        stubLeaveRequest("pending");
        CurrentUser other = new CurrentUser("u-other", "x", "Khác", "", List.of("manager"));

        ApiException e = assertThrows(ApiException.class,
                () -> service.decide(other, "L1", new LeaveDecisionRequest("approve", null)));
        assertEquals(HttpStatus.FORBIDDEN, e.status());
    }

    @Test
    void employeeCannotApproveOwnRequest() {
        stubLeaveRequest("pending");
        CurrentUser selfHr = new CurrentUser("u-dung", "x", "Dung", "", List.of("employee", "hr"));

        ApiException e = assertThrows(ApiException.class,
                () -> service.decide(selfHr, "L1", new LeaveDecisionRequest("approve", null)));
        assertEquals(HttpStatus.FORBIDDEN, e.status());
    }

    @Test
    void alreadyDecidedReturnsConflict() {
        stubLeaveRequest("approved");
        ApiException e = assertThrows(ApiException.class,
                () -> service.decide(cuong, "L1", new LeaveDecisionRequest("reject", null)));
        assertEquals(HttpStatus.CONFLICT, e.status());
    }

    @Test
    void managerApprovesAndConsumesBalance() {
        stubLeaveRequest("pending");
        when(employees.findByUser("u-cuong")).thenReturn(json("{\"id\":\"e-cuong\",\"full_name\":\"Lê Minh Cường\"}"));

        LeaveResult r = service.decide(cuong, "L1", new LeaveDecisionRequest("approve", "OK"));

        assertEquals("approved", r.status());
        verify(hasura).query(eq(LeaveQueries.USE_BALANCE.formatted("used_days")), any());
        verify(workflows).trigger(eq("leave-decision"), any(), any());
    }

    @Test
    void rejectDoesNotTouchBalance() {
        stubLeaveRequest("pending");
        when(employees.findByUser("u-cuong")).thenReturn(json("{\"id\":\"e-cuong\",\"full_name\":\"Lê Minh Cường\"}"));

        LeaveResult r = service.decide(cuong, "L1", new LeaveDecisionRequest("reject", "Trùng đợt cao điểm"));

        assertEquals("rejected", r.status());
        verify(hasura, never()).query(eq(LeaveQueries.USE_BALANCE.formatted("used_days")), any());
    }

    @Test
    void cancelOnlyByOwnerWhilePending() {
        stubLeaveRequest("pending");
        assertEquals("cancelled", service.cancel(dung, "L1").status());

        ApiException e = assertThrows(ApiException.class, () -> service.cancel(cuong, "L1"));
        assertEquals(HttpStatus.NOT_FOUND, e.status());
    }
}
