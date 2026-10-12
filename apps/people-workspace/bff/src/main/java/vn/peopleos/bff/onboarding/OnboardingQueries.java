package vn.peopleos.bff.onboarding;

/** Các truy vấn GraphQL của mục Onboarding. */
final class OnboardingQueries {
    private OnboardingQueries() {}

    static final String COUNT = "query Count { employees_aggregate { aggregate { count } } }";
    static final String MANAGER = "query Mgr($id: uuid!) { employees_by_pk(id: $id) { user_id } }";
    static final String NEW_USER = "mutation NewUser($obj: users_insert_input!) { insert_users_one(object: $obj) { id } }";
    static final String NEW_EMPLOYEE = "mutation NewEmployee($obj: employees_insert_input!) { insert_employees_one(object: $obj) { id employee_code } }";
    static final String NEW_TASKS = "mutation Tasks($objs: [onboarding_tasks_insert_input!]!) { insert_onboarding_tasks(objects: $objs) { affected_rows } }";

    static final String TASK = """
            query Task($id: uuid!) {
              onboarding_tasks_by_pk(id: $id) { id status assignee_role employee { user_id manager { user_id } } }
            }""";

    static final String TASK_DONE = """
            mutation Done($id: uuid!) {
              update_onboarding_tasks_by_pk(pk_columns: {id: $id}, _set: {status: "done", completed_at: "now()"}) { id status }
            }""";
}
