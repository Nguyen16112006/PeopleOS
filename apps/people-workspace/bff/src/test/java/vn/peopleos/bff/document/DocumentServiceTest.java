// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 PeopleOS contributors

package vn.peopleos.bff.document;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import vn.peopleos.bff.audit.AuditService;
import vn.peopleos.bff.integration.clamav.ClamAvClient;
import vn.peopleos.bff.integration.hasura.HasuraClient;
import vn.peopleos.bff.integration.minio.StorageService;
import vn.peopleos.bff.security.CurrentUser;

/** Tải hợp đồng: file_key trong CSDL không được dùng làm đường dẫn MinIO tùy ý (bucket dùng chung giữa các tenant). */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class DocumentServiceTest {
    @Mock HasuraClient hasura;
    @Mock StorageService storage;
    @Mock PdfGenerator pdf;
    @Mock ClamAvClient clamav;
    @Mock AuditService audit;
    @InjectMocks DocumentService service;

    private static final ObjectMapper MAPPER = new ObjectMapper();
    private final CurrentUser owner = new CurrentUser("u-owner", "owner", "Chủ hợp đồng", "", List.of("employee"));

    private static JsonNode json(String s) {
        try {
            return MAPPER.readTree(s);
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    private void stubContract(String fileKey) {
        when(hasura.query(anyString(), any())).thenReturn(json("""
                {"contracts_by_pk":{"id":"C1","employee_id":"e-own","contract_no":"HD-01","contract_type":"x",
                 "start_date":"2026-01-01","end_date":null,"base_salary":1,"allowance":0,"file_key":%s,
                 "employee":{"id":"e-own","user_id":"u-owner","full_name":"A","employee_code":"NV1","department":"d","job_title":"j"}}}
                """.formatted(fileKey == null ? "null" : "\"" + fileKey + "\"")));
    }

    @Test
    void foreignFileKeyIsNeverReadFromStorage() {
        // file_key bị sửa để trỏ sang phiếu lương của nhân viên khác (tenant khác)
        stubContract("payslips/e-victim/2026-10.pdf");
        byte[] generated = "%PDF-generated".getBytes(StandardCharsets.UTF_8);
        when(storage.get("contracts", "e-own/HD-01.pdf")).thenReturn(Optional.of(generated));

        PdfFile f = service.contract(owner, "C1");

        assertArrayEquals(generated, f.content());
        verify(storage, never()).get(eq("payslips"), any());
        verify(storage, never()).get("contracts", "e-own/HD-01-signed.pdf");
    }

    @Test
    void ownSignedCopyIsServed() {
        stubContract("contracts/e-own/HD-01-signed.pdf");
        byte[] signed = "%PDF-signed".getBytes(StandardCharsets.UTF_8);
        when(storage.get("contracts", "e-own/HD-01-signed.pdf")).thenReturn(Optional.of(signed));

        assertArrayEquals(signed, service.contract(owner, "C1").content());
    }
}
