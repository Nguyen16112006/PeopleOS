// SPDX-License-Identifier: Apache-2.0
package vn.peopleos.bff.taxyear.dto;

/** status của bước vừa thực hiện; count: số chứng từ đã phát hành (quyết toán) hoặc 0. */
public record TaxYearResult(int year, String status, int count) {}
