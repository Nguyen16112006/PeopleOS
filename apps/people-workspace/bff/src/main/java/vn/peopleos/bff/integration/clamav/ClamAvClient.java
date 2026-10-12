package vn.peopleos.bff.integration.clamav;

import java.io.IOException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import vn.peopleos.bff.common.ApiException;
import vn.peopleos.bff.config.AppProperties;

/**
 * Quét mã độc bằng ClamAV (dịch vụ clamd) cho mọi tệp người dùng tải lên.
 *
 * <p>Nếu clamd chưa sẵn sàng (ví dụ đang tải cơ sở dữ liệu chữ ký ở lần chạy đầu):
 * mặc định TỪ CHỐI tải lên (fail-closed, an toàn); đặt CLAMAV_FAIL_OPEN=true để cho qua khi demo.
 */
@Component
public class ClamAvClient {
    private static final Logger log = LoggerFactory.getLogger(ClamAvClient.class);
    private final AppProperties.Clamav cfg;

    public ClamAvClient(AppProperties props) {
        this.cfg = props.clamav();
    }

    public ScanResult scan(byte[] data) {
        if (!cfg.enabled()) return ScanResult.skipped();
        try {
            return ClamdProtocol.scan(cfg.host(), cfg.port(), cfg.timeoutMs(), data);
        } catch (IOException e) {
            log.error("Không quét được mã độc: {}", e.getMessage());
            if (cfg.failOpen()) return ScanResult.skipped();
            throw ApiException.unavailable("Dịch vụ quét mã độc chưa sẵn sàng, vui lòng thử lại sau ít phút");
        }
    }
}
