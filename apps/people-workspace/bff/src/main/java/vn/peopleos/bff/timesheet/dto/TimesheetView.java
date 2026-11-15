// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 PeopleOS contributors

package vn.peopleos.bff.timesheet.dto;

import java.util.List;

/**
 * Bảng công tháng của một nhân viên (số liệu tính trực tiếp từ chấm công và đơn nghỉ đã duyệt).
 * id null: chưa gửi lần nào. status ∈ open | submitted | confirmed | closed. editable: người gọi còn được sửa công của tháng này.
 */
public record TimesheetView(String id, String employeeId, int year, int month, String status, String reviewNote, boolean editable,
                            double standardDays, double workDays, double paidLeaveDays, double holidayDays, double unpaidLeaveDays,
                            double absentDays, double paidDays, double otWeekdayHours, double otWeekendHours, double otHolidayHours,
                            List<String> missingDates) {}
