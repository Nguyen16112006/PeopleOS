// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 PeopleOS contributors

package vn.peopleos.bff.tempaccess.dto;

/** status ∈ pending | approved | rejected | expired | revoked; expiresAt (ISO-8601) chỉ có khi đã được cấp. */
public record TempAccessResult(String id, String status, String expiresAt) {}
