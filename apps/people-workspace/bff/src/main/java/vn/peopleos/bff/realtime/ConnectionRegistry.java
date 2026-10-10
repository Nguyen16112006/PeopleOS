package vn.peopleos.bff.realtime;

import java.io.IOException;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;

/** Danh sách kết nối WebSocket đang mở, gom theo người dùng (một người có thể mở nhiều tab). */
@Component
public class ConnectionRegistry {
    private static final Logger log = LoggerFactory.getLogger(ConnectionRegistry.class);
    private final ConcurrentHashMap<String, Set<WebSocketSession>> sessions = new ConcurrentHashMap<>();

    public void add(String userId, WebSocketSession session) {
        sessions.computeIfAbsent(userId, k -> ConcurrentHashMap.newKeySet()).add(session);
    }

    public void remove(String userId, WebSocketSession session) {
        Set<WebSocketSession> set = sessions.get(userId);
        if (set != null) {
            set.remove(session);
            if (set.isEmpty()) sessions.remove(userId);
        }
    }

    /** Gửi JSON tới mọi kết nối của người dùng; trả về số kết nối nhận được. */
    public int sendToUser(String userId, String json) {
        Set<WebSocketSession> set = sessions.get(userId);
        if (set == null) return 0;
        int sent = 0;
        for (WebSocketSession s : set) {
            try {
                synchronized (s) { // WebSocketSession không an toàn khi gửi đồng thời
                    if (s.isOpen()) {
                        s.sendMessage(new TextMessage(json));
                        sent++;
                    }
                }
            } catch (IOException e) {
                log.debug("Bỏ kết nối lỗi của {}: {}", userId, e.getMessage());
                remove(userId, s);
            }
        }
        return sent;
    }
}
