package vn.peopleos.bff.common;

import java.util.LinkedHashMap;
import java.util.Map;

/** Tạo Map tham số cho phép giá trị null (Map.of không cho phép): Params.of("a", 1, "b", null). */
public final class Params {
    private Params() {}

    public static Map<String, Object> of(Object... keyValues) {
        if (keyValues.length % 2 != 0) {
            throw new IllegalArgumentException("Params.of cần số lượng đối số chẵn (cặp khóa, giá trị)");
        }
        Map<String, Object> map = new LinkedHashMap<>();
        for (int i = 0; i < keyValues.length; i += 2) {
            map.put((String) keyValues[i], keyValues[i + 1]);
        }
        return map;
    }
}
