// SPDX-License-Identifier: Apache-2.0
package vn.peopleos.bff.taxyear.dto;

import jakarta.validation.constraints.Size;

/** Body tùy chọn khi Giám đốc trả lại báo cáo: lý do. */
public record ReportDecisionRequest(@Size(max = 1000) String comment) {}
