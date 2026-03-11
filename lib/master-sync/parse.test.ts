import { describe, expect, it } from "vitest";

import { MasterCsvImportError, parseMasterImportCsv } from "@/lib/master-sync/parse";

describe("master csv parser", () => {
  it("parses and normalizes supplier rows without a code column", () => {
    const result = parseMasterImportCsv(
      "suppliers",
      [
        "name,phone,email,is_active",
        "   aLpHa   suPPLIER   ,12345, SALES@EXAMPLE.COM ,yes",
      ].join("\n"),
    );

    expect(result.processed_count).toBe(1);
    expect(result.rejected_rows).toEqual([]);
    expect(result.rows[0]).toMatchObject({
      key: "name:alpha supplier",
      value: {
        code: null,
        name: "Alpha Supplier",
        phone: "12345",
        email: "sales@example.com",
        is_active: true,
      },
    });
  });

  it("rejects duplicate keys in same file and reports first row", () => {
    const result = parseMasterImportCsv(
      "locations",
      [
        "name,timezone,is_active",
        "Main,Europe/London,true",
        " main ,Africa/Cairo,false",
      ].join("\n"),
    );

    expect(result.rows).toHaveLength(1);
    expect(result.rejected_rows).toEqual([
      {
        row_number: 3,
        key: "name:main",
        reason: "Duplicate key in CSV.",
        first_row_number: 2,
      },
    ]);
  });

  it("throws when required headers are missing", () => {
    expect(() =>
      parseMasterImportCsv("products", "name,unit\nItem One,box"),
    ).toThrow(MasterCsvImportError);
  });

  it("throws when file exceeds entity row limit", () => {
    const dataRows = Array.from({ length: 501 }, (_, index) =>
      `P${index + 1},,box,true,,Hair,Shampoo`,
    );

    expect(() =>
      parseMasterImportCsv(
        "products",
        [
          "name,barcode,unit,is_active,description,category_name,subcategory_name",
          ...dataRows,
        ].join("\n"),
      ),
    ).toThrow(MasterCsvImportError);
  });

  it("proper-cases master product names while allowing generated sku and blank barcode", () => {
    const result = parseMasterImportCsv(
      "products",
      [
        "name,barcode,unit,is_active,description,category_name,subcategory_name",
        "  hAIR   maSk  ,,box,true,,Hair,Conditioner",
      ].join("\n"),
    );

    expect(result.rows[0]).toMatchObject({
      key: "name:hair mask",
      value: {
        sku: null,
        name: "Hair Mask",
        barcode: null,
        category_name: "Hair",
        subcategory_name: "Conditioner",
      },
    });
  });

  it("still accepts legacy code columns for backwards compatibility", () => {
    const result = parseMasterImportCsv(
      "categories",
      [
        "code,name,is_active",
        "01,  hAIR  ,true",
      ].join("\n"),
    );

    expect(result.rows[0]).toMatchObject({
      key: "01",
      value: {
        code: "01",
        name: "Hair",
        is_active: true,
      },
    });
  });
});
