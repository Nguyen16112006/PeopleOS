// SPDX-License-Identifier: Apache-2.0
package vn.peopleos.bff.document;

/** Một tệp PDF sẵn sàng trả về cho người dùng. */
public record PdfFile(String filename, byte[] content) {}
