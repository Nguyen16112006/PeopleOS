package vn.peopleos.bff.common;

import static org.junit.jupiter.api.Assertions.assertEquals;

import org.junit.jupiter.api.Test;

class VnNameTest {
    @Test
    void splitsFullName() {
        VnName.Parts p = VnName.split("Nguyễn Văn An");
        assertEquals("Nguyễn Văn", p.lastName());
        assertEquals("An", p.firstName());
    }

    @Test
    void singleWordName() {
        assertEquals("Bình", VnName.split("Bình").lastName());
    }
}
