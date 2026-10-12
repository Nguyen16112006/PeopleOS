package vn.peopleos.bff.integration.clamav;

/** Kết quả quét mã độc một tệp. */
public record ScanResult(Status status, String signature) {
    public enum Status { CLEAN, INFECTED, SKIPPED }

    public static ScanResult clean() { return new ScanResult(Status.CLEAN, null); }
    public static ScanResult infected(String signature) { return new ScanResult(Status.INFECTED, signature); }
    public static ScanResult skipped() { return new ScanResult(Status.SKIPPED, null); }

    public boolean isInfected() { return status == Status.INFECTED; }
}
