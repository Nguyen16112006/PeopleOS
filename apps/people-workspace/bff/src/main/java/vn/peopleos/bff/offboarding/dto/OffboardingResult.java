// SPDX-License-Identifier: Apache-2.0
package vn.peopleos.bff.offboarding.dto;

/** stage: xem {@code OffboardingService.nextStage}; status ∈ open | completed | rejected. */
public record OffboardingResult(String id, String stage, String status) {}
