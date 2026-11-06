// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 PeopleOS contributors

package vn.peopleos.workflow;

import static org.junit.jupiter.api.Assertions.assertEquals;

import org.flowable.engine.ProcessEngine;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

@SpringBootTest(properties = {
        "spring.datasource.url=jdbc:h2:mem:peopleos-workflow-engine;DB_CLOSE_DELAY=-1",
        "spring.datasource.driver-class-name=org.h2.Driver",
        "spring.datasource.username=sa",
        "spring.datasource.password=",
        "flowable.async-executor-activate=false"
})
class WorkflowBpmnTest {
    @Autowired
    private ProcessEngine engine;

    @Test
    void deploysAllBpmnAndSchedulesBothRecurringProcesses() {
        assertEquals(6, engine.getRepositoryService().createProcessDefinitionQuery().count());
        assertEquals(2, engine.getManagementService().createTimerJobQuery().count());
    }
}
