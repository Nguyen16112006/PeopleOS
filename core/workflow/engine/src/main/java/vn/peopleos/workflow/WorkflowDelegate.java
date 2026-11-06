// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 PeopleOS contributors

package vn.peopleos.workflow;

import java.util.Map;
import org.flowable.engine.delegate.DelegateExecution;
import org.flowable.engine.delegate.JavaDelegate;
import org.springframework.stereotype.Component;

@Component("workflowDelegate")
public class WorkflowDelegate implements JavaDelegate {
    private final WorkflowHandler handler;

    public WorkflowDelegate(WorkflowHandler handler) {
        this.handler = handler;
    }

    @Override
    @SuppressWarnings("unchecked")
    public void execute(DelegateExecution execution) {
        Object rawPayload = execution.getVariable("payload");
        Map<String, Object> payload = rawPayload == null ? Map.of() : (Map<String, Object>) rawPayload;
        handler.execute(execution.getCurrentActivityId(), payload,
                (String) execution.getVariable("tenant_id"));
    }
}
