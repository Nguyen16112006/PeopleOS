package vn.peopleos.bff.internal;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import org.springframework.stereotype.Component;
import vn.peopleos.bff.common.ApiException;
import vn.peopleos.bff.config.AppProperties;

/** Kiểm tra khóa nội bộ (header x-internal-key) bằng so sánh thời gian không đổi. */
@Component
public class InternalKeyGuard {
    private final byte[] expected;

    public InternalKeyGuard(AppProperties props) {
        this.expected = props.internalApiKey().getBytes(StandardCharsets.UTF_8);
    }

    public void check(String providedKey) {
        boolean ok = providedKey != null
                && MessageDigest.isEqual(expected, providedKey.getBytes(StandardCharsets.UTF_8));
        if (!ok) throw ApiException.forbidden("Sai khóa nội bộ");
    }
}
