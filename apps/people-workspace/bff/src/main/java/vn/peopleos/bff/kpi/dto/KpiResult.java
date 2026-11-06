// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 PeopleOS contributors

package vn.peopleos.bff.kpi.dto;

/** Kết quả thao tác KPI: status của chu kỳ, mục tiêu hoặc đánh giá; score và rating chỉ có khi chấm đánh giá. */
public record KpiResult(String id, String status, Double score, String rating) {
    public static KpiResult of(String id, String status) {
        return new KpiResult(id, status, null, null);
    }
}
