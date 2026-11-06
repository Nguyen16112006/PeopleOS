// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 PeopleOS contributors

package vn.peopleos.bff.onboarding.dto;

import jakarta.validation.constraints.NotBlank;

/** Một việc trong checklist hội nhập. */
public record TaskInput(@NotBlank String title, @NotBlank String assigneeRole, String dueDate) {}
