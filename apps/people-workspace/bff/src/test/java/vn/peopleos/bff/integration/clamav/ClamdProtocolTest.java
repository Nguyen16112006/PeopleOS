package vn.peopleos.bff.integration.clamav;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.ByteArrayOutputStream;
import java.io.DataInputStream;
import java.io.IOException;
import java.net.ServerSocket;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import org.junit.jupiter.api.Test;

/** Kiểm thử giao thức INSTREAM bằng một clamd giả lập (không cần ClamAV thật). */
class ClamdProtocolTest {

    /** Clamd giả: đọc INSTREAM, trả "FOUND" nếu dữ liệu chứa chuỗi EICAR, ngược lại "OK"; fixedReply != null thì trả đúng chuỗi đó. */
    private static ServerSocket fakeClamd(String fixedReply, ByteArrayOutputStream received) throws IOException {
        ServerSocket server = new ServerSocket(0);
        Thread t = new Thread(() -> {
            try (Socket s = server.accept()) {
                DataInputStream in = new DataInputStream(s.getInputStream());
                byte[] cmd = new byte[10];
                in.readFully(cmd);
                assertEquals("zINSTREAM\0", new String(cmd, StandardCharsets.US_ASCII));
                while (true) {
                    int len = in.readInt();
                    if (len == 0) break;
                    byte[] chunk = new byte[len];
                    in.readFully(chunk);
                    received.write(chunk);
                }
                String reply = fixedReply != null ? fixedReply
                        : (received.toString(StandardCharsets.ISO_8859_1).contains("EICAR")
                        ? "stream: Eicar-Signature FOUND" : "stream: OK");
                s.getOutputStream().write((reply + "\0").getBytes(StandardCharsets.UTF_8));
            } catch (IOException e) {
                throw new RuntimeException(e);
            }
        });
        t.setDaemon(true);
        t.start();
        return server;
    }

    @Test
    void cleanFileIsOk() throws Exception {
        ByteArrayOutputStream got = new ByteArrayOutputStream();
        try (ServerSocket server = fakeClamd(null, got)) {
            ScanResult r = ClamdProtocol.scan("127.0.0.1", server.getLocalPort(), 5000, "%PDF-1.4 hello".getBytes());
            assertEquals(ScanResult.Status.CLEAN, r.status());
        }
        assertEquals("%PDF-1.4 hello", got.toString(StandardCharsets.ISO_8859_1));
    }

    @Test
    void infectedFileIsDetectedWithSignature() throws Exception {
        try (ServerSocket server = fakeClamd(null, new ByteArrayOutputStream())) {
            ScanResult r = ClamdProtocol.scan("127.0.0.1", server.getLocalPort(), 5000, "X5O!P%@AP EICAR-TEST".getBytes());
            assertTrue(r.isInfected());
            assertEquals("Eicar-Signature", r.signature());
        }
    }

    @Test
    void largeFileIsSentInMultipleChunksIntact() throws Exception {
        byte[] data = new byte[1_000_000];
        for (int i = 0; i < data.length; i++) data[i] = (byte) ('a' + i % 26);
        ByteArrayOutputStream got = new ByteArrayOutputStream();
        try (ServerSocket server = fakeClamd(null, got)) {
            ClamdProtocol.scan("127.0.0.1", server.getLocalPort(), 10000, data);
        }
        assertEquals(data.length, got.size());
    }

    @Test
    void clamdErrorBecomesIOException() throws Exception {
        try (ServerSocket server = fakeClamd("INSTREAM size limit exceeded. ERROR", new ByteArrayOutputStream())) {
            assertThrows(IOException.class, () -> ClamdProtocol.scan("127.0.0.1", server.getLocalPort(), 5000, new byte[10]));
        }
    }

    @Test
    void unreachableServerThrowsIOException() {
        assertThrows(IOException.class, () -> ClamdProtocol.scan("127.0.0.1", 1, 500, new byte[1]));
    }
}
