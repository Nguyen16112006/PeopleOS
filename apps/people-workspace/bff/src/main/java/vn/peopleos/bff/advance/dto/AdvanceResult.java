package vn.peopleos.bff.advance.dto;

/** Kết quả: stage ∈ manager | director | director_l2 | accountant | paid | settled | closed; status ∈ pending | approved | rejected. */
public record AdvanceResult(String id, String stage, String status) {}
