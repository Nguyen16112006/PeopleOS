# Workflow Engine (Flowable BPMN)

PeopleOS uses the **Flowable 7.1.0 process engine** (Apache-2.0) as a headless service in the Open-Core layer.
The engine stores process state in PostgreSQL, exposes no host port or end-user UI, and accepts start requests only
from the BFF through the internal Docker network and `INTERNAL_API_KEY`.

The six executable definitions are in `engine/src/main/resources/processes/`:

| Process key | BPMN file | Trigger and action |
|---|---|---|
| `leave-request` | `01-leave-request.bpmn20.xml` | BFF creates a leave request; notify the approver and employee |
| `leave-decision` | `02-leave-decision.bpmn20.xml` | BFF records an approval/rejection; notify the employee |
| `salary-proposal` | `03-salary-proposal.bpmn20.xml` | BFF creates or advances a proposal; route notices by approval stage |
| `onboarding` | `04-onboarding.bpmn20.xml` | BFF creates an employee; create a seven-item checklist and notify stakeholders |
| `temp-access-expire` | `05-temp-access-expire.bpmn20.xml` | BPMN timer start event every minute; expire overdue temporary grants |
| `offboarding-lock` | `06-offboarding-lock.bpmn20.xml` | BPMN timer start event every 15 minutes; lock accounts due for offboarding |

Event processes call the BFF through `/api/internal/*` with both `x-internal-key` and `x-tenant-id`.
The BFF retains fallback handlers so a temporary engine outage does not block a user operation.
Timer start events and process history are persisted by Flowable, so schedules survive container restarts.

## Run and test

From `infrastructure/`, `docker compose up -d --build` builds the engine from this source, starts it after PostgreSQL,
and keeps its HTTP API private to the Compose network. The BFF does not block startup on Flowable; if the engine is
temporarily unavailable, the BFF uses its fallback handlers. Inspect the engine with:

```bash
docker compose logs --tail=100 flowable
cd ../core/workflow/engine && mvn test
```

The BPMN deployment tests verify all six definitions and both recurring timer jobs.
