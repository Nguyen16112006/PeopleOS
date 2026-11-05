// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 PeopleOS contributors

package vn.peopleos.bff.tenant;

import java.util.Optional;
import java.util.UUID;
import java.util.function.Supplier;

/**
 * Tenant của yêu cầu hiện tại (lấy từ claim {@code tenant_id} của JWT).
 *
 * <p>Fail-closed: mọi lời gọi Hasura đều gọi {@link #require()}; không có tenant thì ném lỗi thay vì
 * rơi về dữ liệu chung. Tác vụ nền/n8n phải khai báo tenant tường minh qua {@link #runAs}.
 */
public final class TenantContext {
    private static final ThreadLocal<String> CURRENT = new ThreadLocal<>();

    private TenantContext() {}

    public static boolean isValid(String tenantId) {
        if (tenantId == null) return false;
        try {
            UUID.fromString(tenantId);
            return true;
        } catch (IllegalArgumentException e) {
            return false;
        }
    }

    public static Optional<String> current() {
        return Optional.ofNullable(CURRENT.get());
    }

    public static String require() {
        String t = CURRENT.get();
        if (t == null) throw new IllegalStateException("Thiếu tenant của yêu cầu (token không có claim tenant_id?)");
        return t;
    }

    public static void set(String tenantId) {
        if (!isValid(tenantId)) throw new IllegalArgumentException("tenant_id không hợp lệ: " + tenantId);
        CURRENT.set(tenantId.toLowerCase());
    }

    public static void clear() {
        CURRENT.remove();
    }

    /** Chạy {@code fn} dưới một tenant cụ thể rồi khôi phục giá trị trước đó (dùng cho tác vụ nền/n8n). */
    public static <T> T runAs(String tenantId, Supplier<T> fn) {
        String previous = CURRENT.get();
        set(tenantId);
        try {
            return fn.get();
        } finally {
            if (previous == null) CURRENT.remove(); else CURRENT.set(previous);
        }
    }
}
