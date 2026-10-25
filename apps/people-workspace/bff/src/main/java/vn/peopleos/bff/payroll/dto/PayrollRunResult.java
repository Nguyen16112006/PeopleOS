// SPDX-License-Identifier: Apache-2.0
package vn.peopleos.bff.payroll.dto;

/** status ∈ timesheet_closed | calculated | hr_reviewed | approved | paid; count: số phiếu lương đã tính/phát hành. */
public record PayrollRunResult(String id, String status, int count) {}
