package vn.peopleos.bff.document;

import com.fasterxml.jackson.databind.JsonNode;
import com.lowagie.text.Document;
import com.lowagie.text.DocumentException;
import com.lowagie.text.Element;
import com.lowagie.text.Font;
import com.lowagie.text.PageSize;
import com.lowagie.text.Paragraph;
import com.lowagie.text.Phrase;
import com.lowagie.text.pdf.BaseFont;
import com.lowagie.text.pdf.PdfPCell;
import com.lowagie.text.pdf.PdfPTable;
import com.lowagie.text.pdf.PdfWriter;
import java.awt.Color;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.time.LocalDate;
import java.util.Locale;
import java.util.Map;
import org.springframework.stereotype.Component;
import vn.peopleos.bff.common.Json;

/** Sinh PDF phiếu lương và hợp đồng lao động (OpenPDF + font DejaVu để hiển thị đúng tiếng Việt). */
@Component
public class PdfGenerator {
    private static final String[][] FONT_PATHS = {
            {"/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"},
            {"/usr/share/fonts/dejavu/DejaVuSans.ttf", "/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf"},
    };
    private static final Map<String, String> CONTRACT_TYPES = Map.of(
            "probation", "Thử việc", "fixed_term", "Xác định thời hạn", "indefinite", "Không xác định thời hạn");
    private static final Color HEADER_BG = new Color(226, 232, 240);
    private static final Color TOTAL_BG = new Color(220, 252, 231);

    // ------------------------------------------------------------------ Phiếu lương
    public byte[] payslip(JsonNode p, JsonNode emp) {
        Fonts f = fonts();
        String period = String.format("%02d/%d", p.get("period_month").asInt(), p.get("period_year").asInt());
        return build(PageSize.A4, document -> {
            document.add(new Paragraph("PHIẾU LƯƠNG", f.title));
            document.add(new Paragraph("Kỳ lương: tháng " + period + "  ·  Công ty PeopleOS", f.normal));
            document.add(spacer());
            document.add(table(f, false, new String[][] {
                    {"Nhân viên", emp.get("full_name").asText()},
                    {"Mã nhân viên", emp.get("employee_code").asText()},
                    {"Phòng ban / Chức danh", emp.get("department").asText() + " / " + emp.get("job_title").asText()}}));
            document.add(heading("Thu nhập", f));
            document.add(table(f, false, new String[][] {
                    {"Lương cơ bản", vnd(p, "base_salary")}, {"Phụ cấp", vnd(p, "allowance")},
                    {"Làm thêm giờ", vnd(p, "overtime_pay")}, {"Thưởng", vnd(p, "bonus")},
                    {"Tổng thu nhập (Gross)", vnd(p, "gross")}}));
            document.add(heading("Khấu trừ", f));
            document.add(table(f, false, new String[][] {
                    {"BHXH (8%)", vnd(p, "bhxh_employee")}, {"BHYT (1,5%)", vnd(p, "bhyt_employee")},
                    {"BHTN (1%)", vnd(p, "bhtn_employee")}, {"Thu nhập tính thuế", vnd(p, "taxable_income")},
                    {"Thuế TNCN", vnd(p, "personal_income_tax")}}));
            document.add(spacer());
            document.add(table(f, true, new String[][] {{"THỰC NHẬN (NET)", vnd(p, "net_salary")}}));
            document.add(spacer());
            String paid = Json.text(p, "paid_at");
            document.add(new Paragraph("Ngày chi trả: " + (paid == null ? "—" : paid)
                    + ". Chứng từ điện tử do PeopleOS sinh tự động, số liệu chỉ mang tính minh họa.", f.normal));
        });
    }

    // ------------------------------------------------------------------ Hợp đồng lao động
    public byte[] contract(JsonNode c, JsonNode emp) {
        Fonts f = fonts();
        return build(PageSize.A4, document -> {
            document.add(centered("CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM", f.bold));
            document.add(centered("Độc lập - Tự do - Hạnh phúc", f.normal));
            document.add(spacer());
            document.add(centered("HỢP ĐỒNG LAO ĐỘNG", f.title));
            document.add(centered("Số: " + c.get("contract_no").asText(), f.normal));
            document.add(heading("Bên A - Người sử dụng lao động", f));
            document.add(new Paragraph("Công ty PeopleOS (đơn vị minh họa)", f.normal));
            document.add(heading("Bên B - Người lao động", f));
            document.add(table(f, false, new String[][] {
                    {"Họ và tên", emp.get("full_name").asText()}, {"Mã nhân viên", emp.get("employee_code").asText()},
                    {"Chức danh", emp.get("job_title").asText()}, {"Bộ phận", emp.get("department").asText()}}));
            document.add(heading("Nội dung hợp đồng", f));
            String type = c.get("contract_type").asText();
            String end = Json.text(c, "end_date");
            document.add(table(f, false, new String[][] {
                    {"Loại hợp đồng", CONTRACT_TYPES.getOrDefault(type, type)},
                    {"Ngày bắt đầu", c.get("start_date").asText()}, {"Ngày kết thúc", end == null ? "Không thời hạn" : end},
                    {"Lương cơ bản / tháng", vnd(c, "base_salary")}, {"Phụ cấp / tháng", vnd(c, "allowance")},
                    {"Chế độ bảo hiểm", "BHXH, BHYT, BHTN theo quy định pháp luật"}}));
            document.add(spacer());
            document.add(new Paragraph("Hai bên cam kết thực hiện đúng các điều khoản theo Bộ luật Lao động 2019. "
                    + "Bản điện tử này do PeopleOS sinh tự động để minh họa; bản có chữ ký được lưu trữ trong MinIO.", f.normal));
            document.add(spacer());
            PdfPTable sign = new PdfPTable(2);
            sign.setWidthPercentage(100);
            sign.addCell(plainCell("ĐẠI DIỆN BÊN A", f.bold, Element.ALIGN_CENTER));
            sign.addCell(plainCell("NGƯỜI LAO ĐỘNG (BÊN B)", f.bold, Element.ALIGN_CENTER));
            document.add(sign);
            document.add(new Paragraph("Ngày lập: " + LocalDate.now(), f.normal));
        });
    }

    // ------------------------------------------------------------------ hỗ trợ
    @FunctionalInterface
    private interface Content {
        void write(Document document) throws DocumentException;
    }

    private byte[] build(com.lowagie.text.Rectangle pageSize, Content content) {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        Document document = new Document(pageSize, 56, 56, 50, 50);
        try {
            PdfWriter.getInstance(document, out);
            document.open();
            content.write(document);
            document.close();
            return out.toByteArray();
        } catch (DocumentException e) {
            throw new IllegalStateException("Không sinh được PDF: " + e.getMessage(), e);
        }
    }

    private record Fonts(Font title, Font normal, Font bold) {}

    private Fonts fonts() {
        BaseFont regular = null;
        BaseFont bold = null;
        try {
            for (String[] pair : FONT_PATHS) {
                if (new File(pair[0]).exists() && new File(pair[1]).exists()) {
                    regular = BaseFont.createFont(pair[0], BaseFont.IDENTITY_H, BaseFont.EMBEDDED);
                    bold = BaseFont.createFont(pair[1], BaseFont.IDENTITY_H, BaseFont.EMBEDDED);
                    break;
                }
            }
            if (regular == null) { // dự phòng: mất dấu tiếng Việt
                regular = BaseFont.createFont(BaseFont.HELVETICA, BaseFont.WINANSI, BaseFont.NOT_EMBEDDED);
                bold = BaseFont.createFont(BaseFont.HELVETICA_BOLD, BaseFont.WINANSI, BaseFont.NOT_EMBEDDED);
            }
        } catch (Exception e) {
            throw new IllegalStateException("Không nạp được font PDF: " + e.getMessage(), e);
        }
        return new Fonts(new Font(bold, 16), new Font(regular, 10), new Font(bold, 11));
    }

    private static Paragraph spacer() {
        return new Paragraph(" ");
    }

    private static Paragraph heading(String text, Fonts f) {
        Paragraph p = new Paragraph(text, f.bold);
        p.setSpacingBefore(8);
        p.setSpacingAfter(4);
        return p;
    }

    private static Paragraph centered(String text, Font font) {
        Paragraph p = new Paragraph(text, font);
        p.setAlignment(Element.ALIGN_CENTER);
        return p;
    }

    private static PdfPCell plainCell(String text, Font font, int align) {
        PdfPCell cell = new PdfPCell(new Phrase(text, font));
        cell.setHorizontalAlignment(align);
        cell.setBorder(com.lowagie.text.Rectangle.NO_BORDER);
        cell.setPadding(4);
        return cell;
    }

    /** Bảng hai cột (nhãn - giá trị); dòng cuối được tô nền xanh nếu highlightLast. */
    private PdfPTable table(Fonts f, boolean highlightLast, String[][] rows) throws DocumentException {
        PdfPTable t = new PdfPTable(2);
        t.setWidthPercentage(100);
        t.setWidths(new float[] {60, 40});
        for (int i = 0; i < rows.length; i++) {
            boolean last = highlightLast && i == rows.length - 1;
            for (int c = 0; c < 2; c++) {
                PdfPCell cell = new PdfPCell(new Phrase(rows[i][c], last ? f.bold : f.normal));
                cell.setPadding(5);
                cell.setHorizontalAlignment(c == 0 ? Element.ALIGN_LEFT : Element.ALIGN_RIGHT);
                if (last) cell.setBackgroundColor(TOTAL_BG);
                t.addCell(cell);
            }
        }
        return t;
    }

    private static String vnd(JsonNode node, String field) {
        return String.format(Locale.US, "%,d", node.get(field).asLong()).replace(',', '.') + " đ";
    }
}
