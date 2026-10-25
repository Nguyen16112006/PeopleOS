// SPDX-License-Identifier: Apache-2.0
package vn.peopleos.bff.offboarding;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;
import vn.peopleos.bff.common.ApiException;

/** Kiểm tra quy tắc chuyển giai đoạn nghỉ việc. */
class OffboardingStageTest {
    @Test
    void initialStageDependsOnRole() {
        assertEquals("manager", OffboardingService.initialResignationStage("employee", true));
        assertEquals("director_confirm", OffboardingService.initialResignationStage("employee", false));
        assertEquals("director_confirm", OffboardingService.initialResignationStage("manager", true));
        assertEquals("director_confirm", OffboardingService.initialResignationStage("hr", true));
        assertEquals("director_confirm", OffboardingService.initialResignationStage("accountant", true));
        assertEquals("director_confirm", OffboardingService.initialResignationStage("sysadmin", true));
        assertEquals("hr_review", OffboardingService.initialResignationStage("director", false));
    }

    @Test
    void resignationFlowReachesDone() {
        String[] expected = {"hr_review", "handover", "timesheet", "final_payroll", "director_payroll", "payment", "terminate", "done"};
        String stage = "manager";
        for (String next : expected) {
            stage = OffboardingService.nextStage("resignation", stage);
            assertEquals(next, stage);
        }
    }

    @Test
    void terminationNeedsDirectorDecisionAfterHrReview() {
        assertEquals("director_decision", OffboardingService.nextStage("termination", "hr_review"));
        assertEquals("handover", OffboardingService.nextStage("termination", "director_decision"));
        assertEquals("handover", OffboardingService.nextStage("resignation", "hr_review"));
    }

    @Test
    void actorRolePerStage() {
        assertEquals("manager", OffboardingService.actorRole("manager"));
        assertEquals("director", OffboardingService.actorRole("director_confirm"));
        assertEquals("hr", OffboardingService.actorRole("hr_review"));
        assertEquals("accountant", OffboardingService.actorRole("final_payroll"));
        assertEquals("director", OffboardingService.actorRole("director_payroll"));
        assertEquals("accountant", OffboardingService.actorRole("payment"));
        assertEquals("hr", OffboardingService.actorRole("terminate"));
    }

    @Test
    void onlyEarlyStagesCanBeRejected() {
        assertTrue(OffboardingService.canReject("manager"));
        assertTrue(OffboardingService.canReject("hr_review"));
        assertFalse(OffboardingService.canReject("handover"));
        assertFalse(OffboardingService.canReject("payment"));
    }

    @Test
    void finalStagesHaveNoNext() {
        assertThrows(ApiException.class, () -> OffboardingService.nextStage("resignation", "done"));
        assertThrows(ApiException.class, () -> OffboardingService.actorRole("closed"));
    }
}
