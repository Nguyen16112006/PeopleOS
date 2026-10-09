package vn.peopleos.bff.integration.clamav;

import java.io.BufferedOutputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;

/**
 * Giao thức INSTREAM của clamd (không phụ thuộc Spring để dễ kiểm thử):
 * gửi "zINSTREAM\0", rồi các khối [4 byte độ dài big-endian][dữ liệu], kết thúc bằng khối độ dài 0.
 * Phản hồi dạng "stream: OK" hoặc "stream: <tên-chữ-ký> FOUND".
 */
public final class ClamdProtocol {
    private static final int CHUNK = 8192;

    private ClamdProtocol() {}

    public static ScanResult scan(String host, int port, int timeoutMs, byte[] data) throws IOException {
        try (Socket socket = new Socket()) {
            socket.connect(new InetSocketAddress(host, port), timeoutMs);
            socket.setSoTimeout(timeoutMs);
            OutputStream out = new BufferedOutputStream(socket.getOutputStream());
            out.write("zINSTREAM\0".getBytes(StandardCharsets.US_ASCII));
            for (int offset = 0; offset < data.length; offset += CHUNK) {
                int len = Math.min(CHUNK, data.length - offset);
                out.write(ByteBuffer.allocate(4).putInt(len).array());
                out.write(data, offset, len);
            }
            out.write(new byte[4]); // khối kết thúc
            out.flush();
            return parse(readResponse(socket.getInputStream()));
        }
    }

    /** Đọc đến ký tự NUL hoặc hết luồng. */
    private static String readResponse(InputStream in) throws IOException {
        ByteArrayOutputStream buf = new ByteArrayOutputStream();
        int b;
        while ((b = in.read()) != -1 && b != 0) buf.write(b);
        return buf.toString(StandardCharsets.UTF_8).trim();
    }

    static ScanResult parse(String raw) throws IOException {
        String body = raw.startsWith("stream:") ? raw.substring("stream:".length()).trim() : raw;
        if (body.equals("OK")) return ScanResult.clean();
        if (body.endsWith("FOUND")) return ScanResult.infected(body.substring(0, body.length() - "FOUND".length()).trim());
        throw new IOException("clamd trả về lỗi: " + raw);
    }
}
