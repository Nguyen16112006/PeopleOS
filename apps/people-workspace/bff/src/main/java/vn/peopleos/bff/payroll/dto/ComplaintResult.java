// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 PeopleOS contributors

package vn.peopleos.bff.payroll.dto;

/** status ∈ open | adjusting | resolved | rejected. */
public record ComplaintResult(String id, String status) {}
