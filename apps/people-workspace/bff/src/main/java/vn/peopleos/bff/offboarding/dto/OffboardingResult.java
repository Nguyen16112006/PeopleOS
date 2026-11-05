// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 PeopleOS contributors

package vn.peopleos.bff.offboarding.dto;

/** stage: xem {@code OffboardingService.nextStage}; status ∈ open | completed | rejected. */
public record OffboardingResult(String id, String stage, String status) {}
