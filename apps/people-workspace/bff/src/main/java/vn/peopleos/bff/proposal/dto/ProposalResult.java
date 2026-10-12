package vn.peopleos.bff.proposal.dto;

/** Kết quả: status ∈ pending_hr | pending_admin | approved | rejected. */
public record ProposalResult(String id, String status) {}
