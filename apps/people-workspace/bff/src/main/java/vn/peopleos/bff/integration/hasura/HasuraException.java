package vn.peopleos.bff.integration.hasura;

/** Lỗi khi gọi Hasura (GraphQL trả "errors" hoặc không kết nối được). */
public class HasuraException extends RuntimeException {
    public HasuraException(String message) { super(message); }
}
