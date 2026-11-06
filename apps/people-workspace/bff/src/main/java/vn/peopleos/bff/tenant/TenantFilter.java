// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 PeopleOS contributors

package vn.peopleos.bff.tenant;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.Map;
import org.springframework.http.MediaType;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Đặt {@link TenantContext} từ claim {@code tenant_id} của JWT (chạy sau BearerTokenAuthenticationFilter).
 * Token đã xác thực nhưng thiếu/sai tenant_id bị từ chối 403 - không bao giờ rơi về tenant mặc định.
 * Các đường dẫn không cần JWT (health, internal, ws) đi qua mà không đặt tenant.
 */
public class TenantFilter extends OncePerRequestFilter {
    private final ObjectMapper mapper;

    public TenantFilter(ObjectMapper mapper) {
        this.mapper = mapper;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest req, HttpServletResponse res, FilterChain chain)
            throws ServletException, IOException {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        try {
            if (auth != null && auth.isAuthenticated() && auth.getPrincipal() instanceof Jwt jwt) {
                String tenant = jwt.getClaimAsString("tenant_id");
                if (!TenantContext.isValid(tenant)) {
                    res.setStatus(403);
                    res.setContentType(MediaType.APPLICATION_JSON_VALUE);
                    res.setCharacterEncoding("UTF-8");
                    mapper.writeValue(res.getOutputStream(), Map.of("detail", "Token thiếu hoặc sai tenant_id"));
                    return;
                }
                TenantContext.set(tenant);
            }
            chain.doFilter(req, res);
        } finally {
            TenantContext.clear();
        }
    }
}
