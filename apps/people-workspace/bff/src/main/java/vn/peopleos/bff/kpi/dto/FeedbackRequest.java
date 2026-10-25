// SPDX-License-Identifier: Apache-2.0
package vn.peopleos.bff.kpi.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/** Body của POST /api/kpi/evaluations/{id}/feedback: nhân viên phản hồi kết quả đã được duyệt. */
public record FeedbackRequest(@NotBlank @Size(max = 2000) String feedback) {}
