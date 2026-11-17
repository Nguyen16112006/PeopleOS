// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 PeopleOS contributors

package vn.peopleos.bff.config;

import org.springframework.security.oauth2.core.OAuth2Error;
import org.springframework.security.oauth2.core.OAuth2TokenValidator;
import org.springframework.security.oauth2.core.OAuth2TokenValidatorResult;
import org.springframework.security.oauth2.jwt.Jwt;

/**
 * Ràng buộc token với client đã cấp nó (realm peopleos dùng chung cho nhân viên first-party và end-user của ứng dụng PaaS).
 *
 * <ul>
 *   <li>azp = people-workspace: ứng dụng HR first-party, chấp nhận.</li>
 *   <li>azp = app-*: client của project PaaS; BẮT BUỘC claim client_tenant_id (gắn cứng theo project) trùng tenant_id của user.
 *       Chặn kịch bản developer tenant B dụ nhân viên tenant A đăng nhập vào app của mình rồi dùng token đó gọi BFF.</li>
 *   <li>Còn lại (account, admin-cli, client lạ...): từ chối.</li>
 * </ul>
 */
public class ClientBindingValidator implements OAuth2TokenValidator<Jwt> {
    static final String FIRST_PARTY_CLIENT = "people-workspace";

    @Override
    public OAuth2TokenValidatorResult validate(Jwt jwt) {
        String azp = jwt.getClaimAsString("azp");
        if (FIRST_PARTY_CLIENT.equals(azp)) return OAuth2TokenValidatorResult.success();
        if (azp != null && azp.startsWith("app-")) {
            String userTenant = jwt.getClaimAsString("tenant_id");
            String clientTenant = jwt.getClaimAsString("client_tenant_id");
            if (userTenant != null && userTenant.equals(clientTenant)) return OAuth2TokenValidatorResult.success();
            return fail("Token của ứng dụng không thuộc cùng tenant với người dùng");
        }
        return fail("Token không do client được phép cấp");
    }

    private static OAuth2TokenValidatorResult fail(String msg) {
        return OAuth2TokenValidatorResult.failure(new OAuth2Error("invalid_token", msg, null));
    }
}
