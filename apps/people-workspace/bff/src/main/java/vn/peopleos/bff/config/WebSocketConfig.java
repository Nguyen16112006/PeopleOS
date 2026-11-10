// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 PeopleOS contributors

package vn.peopleos.bff.config;

import java.util.Arrays;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.socket.config.annotation.EnableWebSocket;
import org.springframework.web.socket.config.annotation.WebSocketConfigurer;
import org.springframework.web.socket.config.annotation.WebSocketHandlerRegistry;
import vn.peopleos.bff.realtime.NotificationWebSocketHandler;

/** Đăng ký kênh realtime ws://host/ws?token=... (token được xác thực trong handler). */
@Configuration
@EnableWebSocket
public class WebSocketConfig implements WebSocketConfigurer {
    private final NotificationWebSocketHandler handler;
    private final AppProperties props;

    public WebSocketConfig(NotificationWebSocketHandler handler, AppProperties props) {
        this.handler = handler;
        this.props = props;
    }

    @Override
    public void registerWebSocketHandlers(WebSocketHandlerRegistry registry) {
        // Chỉ cho phép origin của frontend (FRONTEND_URL). Có thể khai báo nhiều origin, ngăn cách bằng dấu phẩy.
        String[] origins = Arrays.stream(props.cors().frontendUrl().split(","))
                .map(String::trim)
                .filter(s -> !s.isEmpty())
                .toArray(String[]::new);
        registry.addHandler(handler, "/ws").setAllowedOrigins(origins);
    }
}