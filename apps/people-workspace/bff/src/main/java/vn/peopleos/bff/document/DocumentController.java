package vn.peopleos.bff.document;

import java.util.Map;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;
import vn.peopleos.bff.security.CurrentUser;

/** API Tài liệu: tải phiếu lương, hợp đồng (PDF) và tải bản hợp đồng đã ký lên MinIO. */
@RestController
public class DocumentController {
    private final DocumentService service;

    public DocumentController(DocumentService service) {
        this.service = service;
    }

    @GetMapping("/api/payslips/{id}/download")
    public ResponseEntity<byte[]> payslip(CurrentUser user, @PathVariable String id) {
        return pdf(service.payslip(user, id));
    }

    @GetMapping("/api/contracts/{id}/download")
    public ResponseEntity<byte[]> contract(CurrentUser user, @PathVariable String id) {
        return pdf(service.contract(user, id));
    }

    @PostMapping("/api/contracts/{id}/upload")
    public Map<String, Object> upload(CurrentUser user, @PathVariable String id, @RequestParam("file") MultipartFile file) {
        return service.uploadSignedContract(user, id, file);
    }

    private static ResponseEntity<byte[]> pdf(PdfFile file) {
        return ResponseEntity.ok()
                .contentType(MediaType.APPLICATION_PDF)
                .header(HttpHeaders.CONTENT_DISPOSITION, ContentDisposition.attachment().filename(file.filename()).build().toString())
                .body(file.content());
    }
}
