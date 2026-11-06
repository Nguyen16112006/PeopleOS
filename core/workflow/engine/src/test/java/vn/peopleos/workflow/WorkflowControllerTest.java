// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 PeopleOS contributors

package vn.peopleos.workflow;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;

import java.util.Map;
import org.flowable.engine.RuntimeService;
import org.junit.jupiter.api.Test;
import org.springframework.web.server.ResponseStatusException;

class WorkflowControllerTest {
    private static final String SECRET = "test-internal-key";
    private final RuntimeService runtime = org.mockito.Mockito.mock(RuntimeService.class);
    private final WorkflowController controller = new WorkflowController(runtime, SECRET);

    @Test
    void startsOnlyKnownProcessWithPayloadAndTenant() {
        Map<String, Object> payload = Map.of("request_id", "leave-1");

        var response = controller.start("leave-request", SECRET,
                new WorkflowController.StartWorkflowRequest(payload, "tenant-1"));

        assertEquals(202, response.getStatusCode().value());
        verify(runtime).startProcessInstanceByKey(eq("leave-request"), argThat((Map<String, Object> variables) ->
                payload.equals(variables.get("payload")) && "tenant-1".equals(variables.get("tenant_id"))));
    }

    @Test
    void rejectsInvalidSecretAndUnknownWorkflow() {
        assertThrows(ResponseStatusException.class, () -> controller.start("leave-request", "wrong",
                new WorkflowController.StartWorkflowRequest(Map.of(), "tenant-1")));
        verifyNoInteractions(runtime);
        assertThrows(ResponseStatusException.class, () -> controller.start("unknown", SECRET,
                new WorkflowController.StartWorkflowRequest(Map.of(), "tenant-1")));
        verifyNoInteractions(runtime);
    }
}
