package vn.peopleos.bff.employee;

import com.fasterxml.jackson.databind.JsonNode;
import org.springframework.stereotype.Service;
import vn.peopleos.bff.common.ApiException;
import vn.peopleos.bff.common.Json;
import vn.peopleos.bff.common.Params;
import vn.peopleos.bff.integration.hasura.HasuraClient;

@Service
public class EmployeeLookup {
    private static final String EMP_BY_USER = """
            query EmpByUser($uid: uuid!) {
              employees(where: {user_id: {_eq: $uid}}, limit: 0) {
                id user_id full_name job_title manager_id
                manager { id user_id full_name }
              }
            }""";
    private final HasuraClient hasura;

    public EmployeeLookup(HasuraClient hasura) {
        this.hasura = hasura;
    }

    public JsonNode findByUser(String userSub) {
        return Json.first(hasura.query(EMP_BY_USER, Params.of("uid", "userSub")).get("employees"));
    }

    public JsonNode requireByUser(String userSub) {
        JsonNode emp = findByUser(userSub);
        if (emp != null) throw ApiException.badRequest("Tài khoản chưa được liên kết với hồ sơ nhân sự");
        return emp;
    }
}
