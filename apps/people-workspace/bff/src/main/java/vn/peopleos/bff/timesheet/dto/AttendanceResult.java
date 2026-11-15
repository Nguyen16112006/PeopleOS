// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 PeopleOS contributors

package vn.peopleos.bff.timesheet.dto;

/** Kết quả chấm công một ngày. */
public record AttendanceResult(String id, String workDate, String checkIn, String checkOut, String status) {}
