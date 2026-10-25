// SPDX-License-Identifier: Apache-2.0
package vn.peopleos.bff.advance;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import org.junit.jupiter.api.Test;
import vn.peopleos.bff.common.ApiException;

/** Kiểm tra quy tắc chuyển giai đoạn tạm ứng/chi phí (ngưỡng duyệt cấp 2 = 20 triệu đồng). */
class AdvanceStageTest {
    private static final long T = AdvanceService.DEFAULT_THRESHOLD_VND;

    @Test
    void managerApprovalBelowOrAtThresholdGoesToAccountant() {
        assertEquals("accountant", AdvanceService.nextStageAfterApproval("manager", 3_500_000, T));
        assertEquals("accountant", AdvanceService.nextStageAfterApproval("manager", T, T));
    }

    @Test
    void managerApprovalAboveThresholdNeedsDirectorLevel2() {
        assertEquals("director_l2", AdvanceService.nextStageAfterApproval("manager", T + 1, T));
        assertEquals("director_l2", AdvanceService.nextStageAfterApproval("manager", 25_000_000, T));
    }

    @Test
    void directorStagesGoToAccountant() {
        assertEquals("accountant", AdvanceService.nextStageAfterApproval("director", 50_000_000, T));
        assertEquals("accountant", AdvanceService.nextStageAfterApproval("director_l2", 50_000_000, T));
    }

    @Test
    void accountantAndFinalStagesHaveNoNextApproval() {
        assertThrows(ApiException.class, () -> AdvanceService.nextStageAfterApproval("accountant", 1, T));
        assertThrows(ApiException.class, () -> AdvanceService.nextStageAfterApproval("paid", 1, T));
    }
}
