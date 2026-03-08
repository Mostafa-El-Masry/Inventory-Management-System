import { describe, expect, it } from "vitest";

import { MasterCsvImportError, parseMasterImportCsv } from "@/lib/master-sync/parse";

describe("master csv parser", () => {
  it("parses and normalizes supplier rows", () => {
    const result = parseMasterImportCsv(
      "suppliers",
      [
        "code,name,phone,email,is_active",
        " sup-01 ,   aLpHa   suPPLIER   ,12345, SALES@EXAMPLE.COM ,yes",
      ].join("\n"),
    );

    expect(result.processed_count).toBe(1);
    expect(result.rejected_rows).toEqual([]);
    expect(result.rows[0]).toMatchObject({
      key: "SUP-01",
      value: {
        code: "SUP-01",
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
        "code,name,timezone,is_active",
        "LOC-01,Main,Asia/Kuwait,true",
        "loc-01,Backup,Asia/Kuwait,false",
      ].join("\n"),
    );

    expect(result.rows).toHaveLength(1);
    expect(result.rejected_rows).toEqual([
      {
        row_number: 3,
        key: "LOC-01",
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
      `SKU-${index + 1},P${index + 1},,box,true,,01,001`,
    );

    expect(() =>
      parseMasterImportCsv(
        "products",
        [
          "sku,name,barcode,unit,is_active,description,category_code,subcategory_code",
          ...dataRows,
        ].join("\n"),
      ),
    ).toThrow(MasterCsvImportError);
  });

  it("proper-cases master product names while keeping codes normalized", () => {
    const result = parseMasterImportCsv(
      "products",
      [
        "sku,name,barcode,unit,is_active,description,category_code,subcategory_code",
        "sku-01,  hAIR   maSk  ,,box,true,,01,001",
      ].join("\n"),
    );

    expect(result.rows[0]).toMatchObject({
      key: "SKU-01",
      value: {
        sku: "SKU-01",
        name: "Hair Mask",
        category_code: "01",
        subcategory_code: "001",
      },
    });
  });
});
