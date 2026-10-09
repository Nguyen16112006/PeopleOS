package vn.peopleos.bff.integration.minio;

import io.minio.BucketExistsArgs;
import io.minio.GetObjectArgs;
import io.minio.MakeBucketArgs;
import io.minio.MinioClient;
import io.minio.PutObjectArgs;
import io.minio.errors.ErrorResponseException;
import java.io.ByteArrayInputStream;
import java.io.InputStream;
import java.util.Optional;
import org.springframework.stereotype.Service;
import vn.peopleos.bff.config.AppProperties;

/**
 * MinIO (S3) - lưu dữ liệu phi cấu trúc: hợp đồng, phiếu lương, chứng từ.
 * Bucket không công khai; mọi truy cập đều qua backend sau khi kiểm quyền.
 */
@Service
public class StorageService {
    private final MinioClient client;

    public StorageService(AppProperties props) {
        AppProperties.Minio m = props.minio();
        this.client = MinioClient.builder()
                .endpoint("http://" + m.endpoint())
                .credentials(m.accessKey(), m.secretKey())
                .build();
    }

    public void put(String bucket, String key, byte[] data, String contentType) {
        try {
            if (!client.bucketExists(BucketExistsArgs.builder().bucket(bucket).build())) {
                client.makeBucket(MakeBucketArgs.builder().bucket(bucket).build());
            }
            try (InputStream in = new ByteArrayInputStream(data)) {
                client.putObject(PutObjectArgs.builder().bucket(bucket).object(key)
                        .stream(in, data.length, -1).contentType(contentType).build());
            }
        } catch (Exception e) {
            throw new StorageException("Không ghi được vào MinIO: " + e.getMessage(), e);
        }
    }

    /** Trả về nội dung tệp, hoặc rỗng nếu tệp/bucket chưa tồn tại. */
    public Optional<byte[]> get(String bucket, String key) {
        try (InputStream in = client.getObject(GetObjectArgs.builder().bucket(bucket).object(key).build())) {
            return Optional.of(in.readAllBytes());
        } catch (ErrorResponseException e) {
            String code = e.errorResponse().code();
            if ("NoSuchKey".equals(code) || "NoSuchBucket".equals(code)) return Optional.empty();
            throw new StorageException("Không đọc được từ MinIO: " + e.getMessage(), e);
        } catch (Exception e) {
            throw new StorageException("Không đọc được từ MinIO: " + e.getMessage(), e);
        }
    }

    public static class StorageException extends RuntimeException {
        public StorageException(String message, Throwable cause) { super(message, cause); }
    }
}
