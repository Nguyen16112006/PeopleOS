// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 PeopleOS contributors

package vn.peopleos.bff.document;

/** Một tệp PDF sẵn sàng trả về cho người dùng. */
public record PdfFile(String filename, byte[] content) {}
