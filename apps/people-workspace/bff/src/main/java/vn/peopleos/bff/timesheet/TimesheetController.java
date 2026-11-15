// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 PeopleOS contributors

package vn.peopleos.bff.timesheet;

import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import vn.peopleos.bff.security.CurrentUser;
import vn.peopleos.bff.timesheet.dto.AttendanceResult;
import vn.peopleos.bff.timesheet.dto.DayRequest;
import vn.peopleos.bff.timesheet.dto.PeriodRequest;
import vn.peopleos.bff.timesheet.dto.TimesheetDecisionRequest;
import vn.peopleos.bff.timesheet.dto.TimesheetView;

/** API Bảng công: chấm công vào/ra, khai công, xem và gửi bảng công tháng, xác nhận. Dùng chung cho cả 6 vai trò. */
@RestController
public class TimesheetController {
    private final TimesheetService service;

    public TimesheetController(TimesheetService service) {
        this.service = service;
    }

    @PostMapping("/api/attendance/check-in")
    public AttendanceResult checkIn(CurrentUser user) {
        return service.checkIn(user);
    }

    @PostMapping("/api/attendance/check-out")
    public AttendanceResult checkOut(CurrentUser user) {
        return service.checkOut(user);
    }

    @PutMapping("/api/attendance/days")
    public AttendanceResult saveDay(CurrentUser user, @Valid @RequestBody DayRequest body) {
        return service.saveDay(user, body);
    }

    /** Bảng công tháng (số liệu tính trực tiếp). employee_id để trống: của chính người gọi. */
    @GetMapping("/api/timesheets")
    public TimesheetView view(CurrentUser user, @RequestParam int year, @RequestParam int month,
                              @RequestParam(name = "employee_id", required = false) String employeeId) {
        return service.view(user, year, month, employeeId);
    }

    @PostMapping("/api/timesheets/submit")
    public TimesheetView submit(CurrentUser user, @Valid @RequestBody PeriodRequest body) {
        return service.submit(user, body);
    }

    @PostMapping("/api/timesheets/{id}/decision")
    public TimesheetView decide(CurrentUser user, @PathVariable String id, @Valid @RequestBody TimesheetDecisionRequest body) {
        return service.decide(user, id, body);
    }
}
