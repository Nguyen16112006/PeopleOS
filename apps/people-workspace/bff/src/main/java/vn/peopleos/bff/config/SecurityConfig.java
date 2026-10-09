package vn.peopleos.bff.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.HttpServletResponse;
import java.util.List;
import java.util.Map;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.MediaType;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.oauth2.core.DelegatingOAuth2TokenValidator;
import org.springframework.security.oauth2.core.OAuth2TokenValidator;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtValidators;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;
import vn.peopleos.bff.security.JwtRoleConverter;

/**
 * Bảo mật: backend là OAuth2 Resource Server - xác thực chữ ký JWT do Keycloak phát hành (JWKS) và kiểm tra issuer.
 * (APISIX đã kiểm token ở cổng; backend kiểm lại để phòng thủ nhiều lớp.)
 *
 * <p>Quy tắc truy cập:
 * <ul>
 *   <li>/api/health, /ws, /api/internal/**, tài liệu API: không yêu cầu JWT ở chuỗi lọc này
 *       (/ws tự xác thực token ở query; /api/internal tự kiểm khóa nội bộ; APISIX còn chặn /api/internal từ bên ngoài).</li>
 *   <li>Mọi đường dẫn khác: bắt buộc JWT hợp lệ. Việc kiểm tra VAI TRÒ nằm trong từng service nghiệp vụ.</li>
 * </ul>
 */
@Configuration
@EnableWebSecurity
public class SecurityConfig {

    @Bean
    JwtDecoder jwtDecoder(AppProperties props) {
        NimbusJwtDecoder decoder = NimbusJwtDecoder.withJwkSetUri(props.jwt().jwksUrl()).build();
        OAuth2TokenValidator<Jwt> withIssuer = JwtValidators.createDefault();
        decoder.setJwtValidator(new DelegatingOAuth2TokenValidator<>(withIssuer));
        return decoder;
    }

    @Bean
    SecurityFilterChain filterChain(HttpSecurity http, ObjectMapper mapper) throws Exception {
        http
            .csrf(AbstractHttpConfigurer::disable)
            .cors(Customizer.withDefaults())
            .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            .authorizeHttpRequests(a -> a
                .requestMatchers("/api/health", "/ws", "/api/internal/**", "/error").permitAll()
                .requestMatchers("/v3/api-docs/**", "/swagger-ui/**", "/swagger-ui.html").permitAll()
                .anyRequest().permitAll())
            .oauth2ResourceServer(o -> o
                .jwt(j -> j.jwtAuthenticationConverter(new JwtRoleConverter()))
                .authenticationEntryPoint((req, res, ex) -> writeJson(mapper, res, 401, "Access token không hợp lệ hoặc đã hết hạn"))
                .accessDeniedHandler((req, res, ex) -> writeJson(mapper, res, 403, "Bạn không có quyền thực hiện thao tác này")));
        return http.build();
    }

    /** CORS chỉ bật khi dev truy cập trực tiếp backend; qua APISIX thì gateway lo CORS (tránh header trùng). */
    @Bean
    CorsConfigurationSource corsConfigurationSource(AppProperties props) {
        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        // Khi CORS tắt: KHÔNG đăng ký cấu hình nào, để Spring bỏ qua xử lý CORS.
        // (Đăng ký một cấu hình rỗng sẽ khiến Spring trả 403 "Invalid CORS request" cho mọi yêu cầu có header Origin,
        // kể cả khi đi qua APISIX - làm hỏng POST /decision và kết nối WebSocket.)
        if (props.cors().enabled()) {
            CorsConfiguration cfg = new CorsConfiguration();
            cfg.setAllowedOrigins(List.of(props.cors().frontendUrl()));
            cfg.setAllowedMethods(List.of("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"));
            cfg.setAllowedHeaders(List.of("*"));
            cfg.setExposedHeaders(List.of("Content-Disposition"));
            source.registerCorsConfiguration("/**", cfg);
        }
        return source;
    }

    private static void writeJson(ObjectMapper mapper, HttpServletResponse res, int status, String detail) throws java.io.IOException {
        res.setStatus(status);
        res.setContentType(MediaType.APPLICATION_JSON_VALUE);
        res.setCharacterEncoding("UTF-8");
        mapper.writeValue(res.getOutputStream(), Map.of("detail", detail));
    }
}