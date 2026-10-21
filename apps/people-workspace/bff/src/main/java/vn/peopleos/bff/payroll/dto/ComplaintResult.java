package vn.peopleos.bff.payroll.dto;

/** status ∈ open | adjusting | resolved | rejected. */
public record ComplaintResult(String id, String status) {}
