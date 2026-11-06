// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 PeopleOS contributors

package vn.peopleos.workflow;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Map;
import java.util.Set;
import org.flowable.engine.RuntimeService;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
public class WorkflowController {
    private static final Set<String> PROCESS_KEYS = Set.of(
            "leave-request", "leave-decision", "salary-proposal", "onboarding",
            "temp-access-expire", "offboarding-lock");

    private final RuntimeService runtime;
    private final String internalApiKey;

    public WorkflowController(RuntimeService runtime,
                              @Value("${peopleos.internal-api-key}") String internalApiKey) {
        this.runtime = runtime;
        this.internalApiKey = internalApiKey;
    }

    @PostMapping("/internal/workflows/{key}")
    public ResponseEntity<Void> start(@PathVariable String key,
                                       @RequestHeader(value = "x-internal-key", required = false) String providedKey,
                                       @RequestBody StartWorkflowRequest body) {
        if (providedKey == null || !MessageDigest.isEqual(
                internalApiKey.getBytes(StandardCharsets.UTF_8), providedKey.getBytes(StandardCharsets.UTF_8))) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Khóa nội bộ không hợp lệ");
        }
        if (!PROCESS_KEYS.contains(key)) throw new ResponseStatusException(HttpStatus.NOT_FOUND);
        if (body.payload() == null || body.tenantId() == null || body.tenantId().isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Thiếu payload hoặc tenant_id");
        }
        runtime.startProcessInstanceByKey(key, Map.of(
                "payload", body.payload(),
                "tenant_id", body.tenantId()));
        return ResponseEntity.accepted().build();
    }

    public record StartWorkflowRequest(Map<String, Object> payload, String tenantId) {}
}
