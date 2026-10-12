package vn.peopleos.bff.realtime;

import java.io.IOException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.TextWebSocketHandler;
import org.springframework.web.util.UriComponentsBuilder;
import vn.peopleos.bff.security.CurrentUser;

/**
 * Kênh realtime: ws://host/ws?token=<access_token>.
 * Trình duyệt không gửi được header Authorization khi mở WebSocket nên token đi qua query và được xác thực chữ ký tại đây.
 */
@Component
public class NotificationWebSocketHandler extends TextWebSocketHandler {
    private static final Logger log = LoggerFactory.getLogger(NotificationWebSocketHandler.class);
    private static final String USER_ATTR = "userId";
    private final JwtDecoder decoder;
    private final ConnectionRegistry registry;

    public NotificationWebSocketHandler(JwtDecoder decoder, ConnectionRegistry registry) {
        this.decoder = decoder;
        this.registry = registry;
    }

    @Override
    public void afterConnectionEstablished(WebSocketSession session) throws IOException {
        String token = session.getUri() == null ? null
                : UriComponentsBuilder.fromUri(session.getUri()).build().getQueryParams().getFirst("token");
        try {
            if (token == null || token.isBlank()) throw new IllegalArgumentException("thiếu token");
            Jwt jwt = decoder.decode(token);
            CurrentUser user = CurrentUser.from(jwt);
            session.getAttributes().put(USER_ATTR, user.sub());
            registry.add(user.sub(), session);
            session.sendMessage(new TextMessage("{\"type\":\"connected\",\"user\":\"" + user.username() + "\"}"));
        } catch (Exception e) {
            log.debug("Từ chối WebSocket: {}", e.getMessage());
            session.close(new CloseStatus(4401, "Token không hợp lệ"));
        }
    }

    @Override
    protected void handleTextMessage(WebSocketSession session, TextMessage message) throws IOException {
        if ("ping".equals(message.getPayload())) session.sendMessage(new TextMessage("pong"));
    }

    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus status) {
        Object userId = session.getAttributes().get(USER_ATTR);
        if (userId != null) registry.remove(userId.toString(), session);
    }
}
