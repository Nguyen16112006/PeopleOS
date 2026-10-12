package vn.peopleos.bff.common;

import org.springframework.http.HttpStatus;

/** Lỗi nghiệp vụ có mã HTTP; được {@link GlobalExceptionHandler} chuyển thành {"detail": "..."}. */
public class ApiException extends RuntimeException {
    private final HttpStatus status;

    public ApiException(HttpStatus status, String message) {
        super(message);
        this.status = status;
    }

    public HttpStatus status() { return status; }

    public static ApiException badRequest(String m)   { return new ApiException(HttpStatus.BAD_REQUEST, m); }
    public static ApiException unauthorized(String m) { return new ApiException(HttpStatus.UNAUTHORIZED, m); }
    public static ApiException forbidden(String m)    { return new ApiException(HttpStatus.FORBIDDEN, m); }
    public static ApiException notFound(String m)     { return new ApiException(HttpStatus.NOT_FOUND, m); }
    public static ApiException conflict(String m)     { return new ApiException(HttpStatus.CONFLICT, m); }
    public static ApiException tooLarge(String m)     { return new ApiException(HttpStatus.PAYLOAD_TOO_LARGE, m); }
    public static ApiException unprocessable(String m) { return new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, m); }
    public static ApiException unsupported(String m)   { return new ApiException(HttpStatus.UNSUPPORTED_MEDIA_TYPE, m); }
    public static ApiException unavailable(String m)  { return new ApiException(HttpStatus.SERVICE_UNAVAILABLE, m); }
}
