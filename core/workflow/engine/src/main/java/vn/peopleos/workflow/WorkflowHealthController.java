// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 PeopleOS contributors

package vn.peopleos.workflow;

import java.util.Map;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class WorkflowHealthController {
    @GetMapping("/healthz")
    public Map<String, String> health() {
        return Map.of("status", "ok");
    }
}
