package vn.peopleos.bff.proposal;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
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
import vn.peopleos.bff.notification.NotificationService;
import vn.peopleos.bff.proposal.dto.CreateProposalRequest;
import vn.peopleos.bff.proposal.dto.ProposalDecisionRequest;
import vn.peopleos.bff.proposal.dto.ProposalResult;
import vn.peopleos.bff.security.CurrentUser;

@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class ProposalServiceTest {
    @Mock HasuraClient hasura;
    @Mock EmployeeLookup employees;
    @Mock WorkflowClient workflows;
    @Mock NotificationService notifications;
    @Mock AuditService audit;
    @InjectMocks ProposalService service;

    private static final ObjectMapper MAPPER = new ObjectMapper();
    private final CurrentUser manager = new CurrentUser("u-cuong", "manager", "Lê Minh Cường", "", List.of("manager", "employee"));
    private final CurrentUser hr = new CurrentUser("u-hr", "hr", "Trần Thị Bình", "", List.of("hr", "employee"));
    private final CurrentUser admin = new CurrentUser("u-admin", "admin", "Nguyễn Văn An", "", List.of("admin", "employee"));

    private static JsonNode json(String s) {
        try {
            return MAPPER.readTree(s);
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    private void stubTarget() {
        when(hasura.query(eq(ProposalQueries.TARGET), any())).thenReturn(json("""
                {"employees_by_pk":{"id":"e-dung","user_id":"u-dung","full_name":"Phạm Thu Dung","manager":{"user_id":"u-cuong"},
                 "contracts":[{"id":"c1","base_salary":18000000,"allowance":2000000}]}}"""));
    }

    private void stubProposal(String status, String hrStatus, String adminStatus) {
        when(hasura.query(eq(ProposalQueries.BY_ID), any())).thenReturn(json("""
                {"salary_proposals_by_pk":{"id":"P1","status":"%s","proposal_type":"raise","current_amount":18000000,
                 "proposed_amount":21000000,"employee_id":"e-dung",
                 "employee":{"id":"e-dung","user_id":"u-dung","full_name":"Phạm Thu Dung"},
                 "proposer":{"id":"e-cuong","user_id":"u-cuong","full_name":"Lê Minh Cường"},
                 "approval_steps":[{"id":"s1","step_order":1,"approver_role":"hr","status":"%s"},
                                   {"id":"s2","step_order":2,"approver_role":"admin","status":"%s"}]}}
                """.formatted(status, hrStatus, adminStatus)));
        when(employees.findByUser(any())).thenReturn(json("{\"id\":\"e-x\",\"full_name\":\"Người duyệt\"}"));
    }

    private static CreateProposalRequest request(long amount) {
        return new CreateProposalRequest("e-dung", "raise", amount, "Hoàn thành vượt KPI", null);
    }

    @Test
    void employeeCannotCreateProposal() {
        CurrentUser emp = new CurrentUser("u-dung", "e", "Dung", "", List.of("employee"));
        ApiException e = assertThrows(ApiException.class, () -> service.create(emp, request(21_000_000)));
        assertEquals(HttpStatus.FORBIDDEN, e.status());
    }

    @Test
    void managerOnlyForOwnTeam() {
        stubTarget();
        CurrentUser otherManager = new CurrentUser("u-khac", "m", "Khác", "", List.of("manager"));
        ApiException e = assertThrows(ApiException.class, () -> service.create(otherManager, request(21_000_000)));
        assertEquals(HttpStatus.FORBIDDEN, e.status());
    }

    @Test
    void proposedAmountMustIncrease() {
        stubTarget();
        ApiException e = assertThrows(ApiException.class, () -> service.create(manager, request(17_000_000)));
        assertEquals(HttpStatus.BAD_REQUEST, e.status());
    }

    @Test
    void createsTwoStepChainHrThenAdmin() {
        stubTarget();
        when(employees.requireByUser("u-cuong")).thenReturn(json("{\"id\":\"e-cuong\"}"));
        when(hasura.query(eq(ProposalQueries.CREATE), any())).thenReturn(json(
                "{\"insert_salary_proposals_one\":{\"id\":\"P1\",\"status\":\"pending_hr\"}}"));

        ProposalResult r = service.create(manager, request(21_000_000));

        assertEquals("pending_hr", r.status());
        verify(workflows).trigger(eq("salary-proposal"), argThat(m -> "created".equals(m.get("event"))), any());
    }

    @Test
    void hrApprovalMovesToAdminStep() {
        stubProposal("pending_hr", "pending", "waiting");
        ProposalResult r = service.decide(hr, "P1", new ProposalDecisionRequest("approve", null));
        assertEquals("pending_admin", r.status());
        verify(workflows).trigger(eq("salary-proposal"), argThat(m -> "admin".equals(m.get("next_role"))), any());
    }

    @Test
    void hrCannotApproveAdminStep() {
        stubProposal("pending_admin", "approved", "pending");
        ApiException e = assertThrows(ApiException.class, () -> service.decide(hr, "P1", new ProposalDecisionRequest("approve", null)));
        assertEquals(HttpStatus.FORBIDDEN, e.status());
    }

    @Test
    void finalApprovalAppliesNewSalaryToContract() {
        stubProposal("pending_admin", "approved", "pending");
        when(hasura.query(eq(ProposalQueries.ACTIVE_CONTRACT), any())).thenReturn(json("{\"contracts\":[{\"id\":\"c1\"}]}"));

        ProposalResult r = service.decide(admin, "P1", new ProposalDecisionRequest("approve", null));

        assertEquals("approved", r.status());
        verify(hasura).query(eq(ProposalQueries.APPLY.formatted("base_salary")), argThat(m -> Long.valueOf(21_000_000L).equals(m.get("v"))));
    }

    @Test
    void rejectionEndsChainWithoutApplying() {
        stubProposal("pending_hr", "pending", "waiting");
        ProposalResult r = service.decide(hr, "P1", new ProposalDecisionRequest("reject", "Vượt ngân sách"));
        assertEquals("rejected", r.status());
        verify(hasura, never()).query(eq(ProposalQueries.APPLY.formatted("base_salary")), any());
    }

    @Test
    void proposerCannotApproveOwnProposal() {
        stubProposal("pending_hr", "pending", "waiting");
        CurrentUser proposerHr = new CurrentUser("u-cuong", "m", "Cường", "", List.of("manager", "hr"));
        ApiException e = assertThrows(ApiException.class, () -> service.decide(proposerHr, "P1", new ProposalDecisionRequest("approve", null)));
        assertEquals(HttpStatus.FORBIDDEN, e.status());
    }
}
