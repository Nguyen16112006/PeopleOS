package vn.peopleos.bff.document;

import com.fasterxml.jackson.databind.JsonNode;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;
import java.util.function.Supplier;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;
import vn.peopleos.bff.audit.AuditService;
import vn.peopleos.bff.common.ApiException;
import vn.peopleos.bff.common.Json;
import vn.peopleos.bff.common.Params;
import vn.peopleos.bff.integration.clamav.ClamAvClient;
import vn.peopleos.bff.integration.clamav.ScanResult;
import vn.peopleos.bff.integration.hasura.HasuraClient;
import vn.peopleos.bff.integration.minio.StorageService;
import vn.peopleos.bff.security.CurrentUser;

/**
 * Tài liệu: phiếu lương và hợp đồng (PDF) lưu trên MinIO.
 * Phân quyền: chỉ chủ tài liệu hoặc HR/Admin được tải. PDF được sinh lần đầu rồi lưu MinIO (cache);
 * nếu MinIO tạm lỗi thì vẫn sinh PDF tại chỗ để người dùng không bị gián đoạn.
 */
@Service
public class DocumentService {
    private static final Logger log = LoggerFactory.getLogger(DocumentService.class);
    private static final long MAX_UPLOAD_BYTES = 10L * 1024 * 1024;

    private static final String PAYROLL = """
            query PayrollDoc($id: uuid!) {
              payrolls_by_pk(id: $id) {
                id employee_id period_year period_month base_salary allowance overtime_pay bonus gross bhxh_employee bhyt_employee
                bhtn_employee taxable_income personal_income_tax net_salary paid_at file_key
                employee { id user_id full_name employee_code department job_title }
              }
            }""";
    private static final String CONTRACT = """
            query ContractDoc($id: uuid!) {
              contracts_by_pk(id: $id) {
                id employee_id contract_no contract_type start_date end_date base_salary allowance file_key
                employee { id user_id full_name employee_code department job_title }
              }
            }""";
    private static final String SET_PAYROLL_KEY =
            "mutation K($id: uuid!, $k: String!) { update_payrolls_by_pk(pk_columns: {id: $id}, _set: {file_key: $k}) { id } }";
    private static final String SET_CONTRACT_KEY =
            "mutation K($id: uuid!, $k: String!) { update_contracts_by_pk(pk_columns: {id: $id}, _set: {file_key: $k}) { id } }";

    private final HasuraClient hasura;
    private final StorageService storage;
    private final PdfGenerator pdf;
    private final ClamAvClient clamav;
    private final AuditService audit;

    public DocumentService(HasuraClient hasura, StorageService storage, PdfGenerator pdf, ClamAvClient clamav, AuditService audit) {
        this.clamav = clamav;
        this.audit = audit;
        this.hasura = hasura;
        this.storage = storage;
        this.pdf = pdf;
    }

    // ------------------------------------------------------------------ 1. Phiếu lương
    public PdfFile payslip(CurrentUser user, String payrollId) {
        JsonNode p = hasura.query(PAYROLL, Params.of("id", payrollId)).get("payrolls_by_pk");
        if (Json.isMissing(p) || !allowed(user, p.get("employee"))) throw ApiException.notFound("Không tìm thấy phiếu lương");

        String key = p.get("employee_id").asText() + "/" + p.get("period_year").asInt() + "-" + String.format("%02d", p.get("period_month").asInt()) + ".pdf";
        byte[] content = loadOrCreate("payslips", key, () -> pdf.payslip(p, p.get("employee")), SET_PAYROLL_KEY, payrollId);
        audit.record(user, "PAYSLIP.DOWNLOADED", "payroll", payrollId, Params.of("owner_employee_id", p.get("employee_id").asText()));
        return new PdfFile(String.format("payslip-%d-%02d.pdf", p.get("period_year").asInt(), p.get("period_month").asInt()), content);
    }

    // ------------------------------------------------------------------ 2. Hợp đồng
    public PdfFile contract(CurrentUser user, String contractId) {
        JsonNode c = hasura.query(CONTRACT, Params.of("id", contractId)).get("contracts_by_pk");
        if (Json.isMissing(c) || !allowed(user, c.get("employee"))) throw ApiException.notFound("Không tìm thấy hợp đồng");
        String filename = c.get("contract_no").asText() + ".pdf";

        // Nếu HR đã tải lên bản ký, ưu tiên bản đó
        String fileKey = Json.text(c, "file_key");
        if (fileKey != null && fileKey.contains("/")) {
            int slash = fileKey.indexOf('/');
            try {
                Optional<byte[]> stored = storage.get(fileKey.substring(0, slash), fileKey.substring(slash + 1));
                if (stored.isPresent()) {
                    audit.record(user, "CONTRACT.DOWNLOADED", "contract", contractId, Params.of("variant", "signed"));
                    return new PdfFile(filename, stored.get());
                }
            } catch (Exception e) {
                log.warn("MinIO không đọc được: {}", e.getMessage());
            }
        }
        String key = c.get("employee_id").asText() + "/" + c.get("contract_no").asText() + ".pdf";
        byte[] content = loadOrCreate("contracts", key, () -> pdf.contract(c, c.get("employee")), SET_CONTRACT_KEY, contractId);
        audit.record(user, "CONTRACT.DOWNLOADED", "contract", contractId, Params.of("variant", "generated"));
        return new PdfFile(filename, content);
    }

    // ------------------------------------------------------------------ 3. Tải bản ký lên (HR/Admin)
    public Map<String, Object> uploadSignedContract(CurrentUser user, String contractId, MultipartFile file) {
        if (!user.hasAny("hr", "admin")) throw ApiException.forbidden("Cần một trong các vai trò: hr, admin");
        JsonNode c = hasura.query(CONTRACT, Params.of("id", contractId)).get("contracts_by_pk");
        if (Json.isMissing(c)) throw ApiException.notFound("Không tìm thấy hợp đồng");

        byte[] content;
        try {
            content = file.getBytes();
        } catch (java.io.IOException e) {
            throw ApiException.badRequest("Không đọc được tệp tải lên");
        }
        if (content.length == 0) throw ApiException.badRequest("Tệp rỗng");
        if (content.length > MAX_UPLOAD_BYTES) throw ApiException.tooLarge("Tệp quá lớn (tối đa 10 MB)");

        // Quét mã độc TRƯỚC khi lưu vào MinIO
        ScanResult scan = clamav.scan(content);
        if (scan.isInfected()) {
            audit.record(user, "FILE.QUARANTINED", "contract", contractId, Params.of(
                    "filename", String.valueOf(file.getOriginalFilename()), "signature", scan.signature(), "size", content.length));
            throw ApiException.unprocessable("Tệp bị từ chối: phát hiện mã độc (" + scan.signature() + ")");
        }
        // Sau khi tệp sạch mới kiểm tra định dạng: chỉ nhận PDF thật (bắt đầu bằng %PDF-)
        if (!isPdf(content)) throw ApiException.unsupported("Chỉ chấp nhận tệp PDF hợp lệ");

        String key = c.get("employee_id").asText() + "/" + c.get("contract_no").asText() + "-signed.pdf";
        try {
            storage.put("contracts", key, content, file.getContentType() == null ? "application/pdf" : file.getContentType());
        } catch (Exception e) {
            throw ApiException.unavailable("MinIO chưa sẵn sàng: " + e.getMessage());
        }
        hasura.query(SET_CONTRACT_KEY, Params.of("id", contractId, "k", "contracts/" + key));

        audit.record(user, "CONTRACT.UPLOADED", "contract", contractId, Params.of(
                "file_key", "contracts/" + key, "size", content.length, "virus_scan", scan.status().name()));
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("id", contractId);
        body.put("file_key", "contracts/" + key);
        body.put("size", content.length);
        return body;
    }

    // ------------------------------------------------------------------ hỗ trợ
    /** Tệp PDF hợp lệ bắt đầu bằng "%PDF-". */
    private static boolean isPdf(byte[] content) {
        return content.length > 5 && content[0] == '%' && content[1] == 'P' && content[2] == 'D' && content[3] == 'F' && content[4] == '-';
    }

    private static boolean allowed(CurrentUser user, JsonNode employee) {
        return user.hasAny("hr", "admin") || user.sub().equals(Json.text(employee, "user_id"));
    }

    /** Đọc từ MinIO; chưa có thì sinh PDF, lưu MinIO và ghi file_key vào CSDL. */
    private byte[] loadOrCreate(String bucket, String key, Supplier<byte[]> build, String setKeyMutation, String recordId) {
        try {
            Optional<byte[]> cached = storage.get(bucket, key);
            if (cached.isPresent()) return cached.get();
        } catch (Exception e) {
            log.warn("MinIO không đọc được ({}) - sinh PDF tại chỗ", e.getMessage());
        }
        byte[] generated = build.get();
        try {
            storage.put(bucket, key, generated, "application/pdf");
            hasura.query(setKeyMutation, Params.of("id", recordId, "k", bucket + "/" + key));
        } catch (Exception e) {
            log.warn("Không lưu được vào MinIO: {}", e.getMessage());
        }
        return generated;
    }
}
