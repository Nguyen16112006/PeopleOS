package vn.peopleos.bff.kpi;

/** Truy vấn/đột biến GraphQL cho đánh giá hiệu suất (KPI) theo quý. */
final class KpiQueries {
    private KpiQueries() {}

    static final String CYCLE_BY_ID = """
            query KpiCycle($id: uuid!) {
              kpi_cycles_by_pk(id: $id) { id name year quarter status start_date end_date }
            }""";

    static final String CYCLE_EXISTS = """
            query KpiCycleExists($year: smallint!, $quarter: smallint!) {
              kpi_cycles(where: {year: {_eq: $year}, quarter: {_eq: $quarter}}, limit: 1) { id }
            }""";

    static final String CYCLE_INSERT = """
            mutation KpiCycleInsert($obj: kpi_cycles_insert_input!) {
              insert_kpi_cycles_one(object: $obj) { id status }
            }""";

    static final String CYCLE_STATUS = """
            mutation KpiCycleStatus($id: uuid!, $status: String!) {
              update_kpi_cycles_by_pk(pk_columns: {id: $id}, _set: {status: $status}) { id status }
            }""";

    static final String EMPLOYEE = """
            query KpiEmployee($id: uuid!) {
              employees_by_pk(id: $id) { id user_id full_name status hire_date manager { user_id } }
            }""";

    static final String GOALS_OF = """
            query KpiGoalsOf($cid: uuid!, $eid: uuid!) {
              kpi_goals(where: {cycle_id: {_eq: $cid}, employee_id: {_eq: $eid}}) { id weight title }
            }""";

    static final String GOAL_INSERT = """
            mutation KpiGoalInsert($obj: kpi_goals_insert_input!) {
              insert_kpi_goals_one(object: $obj) { id }
            }""";

    static final String GOAL_BY_ID = """
            query KpiGoalById($id: uuid!) {
              kpi_goals_by_pk(id: $id) {
                id title cycle { id status } employee { manager { user_id } }
              }
            }""";

    static final String GOAL_DELETE = """
            mutation KpiGoalDelete($id: uuid!) {
              delete_kpi_goals_by_pk(id: $id) { id }
            }""";

    static final String EVAL_UPSERT = """
            mutation KpiEvalUpsert($obj: kpi_evaluations_insert_input!) {
              insert_kpi_evaluations_one(object: $obj, on_conflict: {constraint: kpi_evaluations_cycle_id_employee_id_key,
                update_columns: [evaluator_id, goal_scores, score, rating, comment, status]}) { id status score rating }
            }""";

    static final String EVALS_OF_CYCLE = """
            query KpiEvalsOfCycle($cid: uuid!) {
              kpi_evaluations(where: {cycle_id: {_eq: $cid}}) { id employee_id status rating employee { user_id } }
            }""";

    static final String EXPECTED_EMPLOYEES = """
            query KpiExpected($end: date!) {
              employees(where: {status: {_neq: "terminated"}, manager_id: {_is_null: false}, hire_date: {_lte: $end}}) { id full_name }
            }""";

    static final String EVALS_STATUS = """
            mutation KpiEvalsStatus($cid: uuid!, $from: String!, $to: String!) {
              update_kpi_evaluations(where: {cycle_id: {_eq: $cid}, status: {_eq: $from}}, _set: {status: $to}) { affected_rows }
            }""";

    static final String EVAL_BY_ID = """
            query KpiEvalById($id: uuid!) {
              kpi_evaluations_by_pk(id: $id) { id status employee { user_id full_name } }
            }""";

    static final String EVAL_FEEDBACK = """
            mutation KpiFeedback($id: uuid!, $text: String!) {
              update_kpi_evaluations_by_pk(pk_columns: {id: $id}, _set: {employee_feedback: $text, feedback_at: "now()"}) { id }
            }""";
}
