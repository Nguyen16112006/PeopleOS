package vn.peopleos.bff.common;

import java.util.Arrays;

/** Tách tên Việt: "Nguyễn Văn An" -> họ đệm "Nguyễn Văn", tên "An". */
public final class VnName {
    private VnName() {}

    public record Parts(String lastName, String firstName) {}

    public static Parts split(String fullName) {
        String[] p = fullName.trim().split("\\s+");
        if (p.length == 1) return new Parts(p[0], "");
        String last = String.join(" ", Arrays.copyOfRange(p, 0, p.length - 1));
        return new Parts(last, p[p.length - 1]);
    }
}
