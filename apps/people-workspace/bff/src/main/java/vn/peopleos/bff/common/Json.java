package vn.peopleos.bff.common;

import com.fasterxml.jackson.databind.JsonNode;

/** Đọc JsonNode an toàn (trả null thay vì ném lỗi khi thiếu hoặc null). */
public final class Json {
    private Json() {}

    public static String text(JsonNode node, String field) {
        if (node == null) return null;
        JsonNode v = node.get(field);
        return (v == null || v.isNull()) ? null : v.asText();
    }

    /** Phần tử đầu của mảng, hoặc null nếu mảng rỗng/không tồn tại. */
    public static JsonNode first(JsonNode array) {
        return (array == null || !array.isArray() || array.isEmpty()) ? null : array.get(0);
    }

    public static boolean isMissing(JsonNode node) {
        return node == null || node.isNull() || node.isMissingNode();
    }
}
