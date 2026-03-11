import { describe, expect, it } from "vitest";

import {
  buildProductImportTemplateCsv,
  parseProductImportCsv,
  PRODUCT_IMPORT_BATCH_SIZE,
  ProductImportError,
} from "@/lib/products/import";

describe("product csv import helpers", () => {
  it("builds template headers", () => {
    expect(buildProductImportTemplateCsv()).toBe(
      "name,category_name,subcategory_name,barcode,unit,is_active,description\n",
    );
  });

  it("parses valid csv rows", () => {
    const result = parseProductImportCsv(
      [
        "name,category_name,subcategory_name,barcode,unit,is_active,description",
        "  pARACETAMOL  ,Hair,Shampoo,8901000000011,box,true,Tablet strip",
        "Vitamin C,Hair,Conditioner,,box,no,Effervescent",
      ].join("\n"),
    );

    expect(result).toEqual({
      rows: [
        {
          row_number: 2,
          name: "Paracetamol",
          category_name: "Hair",
          subcategory_name: "Shampoo",
          barcode: "8901000000011",
          unit: "box",
          is_active: true,
          description: "Tablet strip",
        },
        {
          row_number: 3,
          name: "Vitamin C",
          category_name: "Hair",
          subcategory_name: "Conditioner",
          barcode: null,
          unit: "box",
          is_active: false,
          description: "Effervescent",
        },
      ],
      rejected_rows: [],
      processed_count: 2,
    });
  });

  it("collapses whitespace and proper-cases imported product names only", () => {
    const result = parseProductImportCsv(
      [
        "name,category_name,subcategory_name,barcode,unit,is_active,description",
        "  hair   repair   serum  ,  hAIR  ,  conDitioner  ,,box,true,",
      ].join("\n"),
    );

    expect(result).toEqual({
      rows: [
        {
          row_number: 2,
          name: "Hair Repair Serum",
          category_name: "hAIR",
          subcategory_name: "conDitioner",
          barcode: null,
          unit: "box",
          is_active: true,
          description: null,
        },
      ],
      rejected_rows: [],
      processed_count: 1,
    });
  });

  it("rejects csv missing required headers", () => {
    expect(() =>
      parseProductImportCsv("name,category_name,barcode\nParacetamol,Hair,123"),
    ).toThrowError(ProductImportError);
  });

  it("parses csv larger than the internal batch size", () => {
    const lines = ["name,category_name,subcategory_name,barcode,unit,is_active,description"];
    for (let index = 0; index < PRODUCT_IMPORT_BATCH_SIZE + 1; index += 1) {
      lines.push(`Product ${index},Hair,Shampoo,,unit,true,`);
    }

    const result = parseProductImportCsv(lines.join("\n"));

    expect(result.rows).toHaveLength(PRODUCT_IMPORT_BATCH_SIZE + 1);
    expect(result.rejected_rows).toEqual([]);
    expect(result.processed_count).toBe(PRODUCT_IMPORT_BATCH_SIZE + 1);
    expect(result.rows[0]).toMatchObject({
      row_number: 2,
      name: "Product 0",
    });
    expect(result.rows[result.rows.length - 1]).toMatchObject({
      row_number: PRODUCT_IMPORT_BATCH_SIZE + 2,
      name: `Product ${PRODUCT_IMPORT_BATCH_SIZE}`,
    });
  });

  it("skips invalid rows and keeps valid rows", () => {
    const result = parseProductImportCsv(
      [
        "name,category_name,subcategory_name,barcode,unit,is_active,description",
        "A,Hair,Shampoo,8901000000011,box,true,Too short name",
        "Vitamin C,Hair,Conditioner,8901000000012,box,true,Effervescent",
      ].join("\n"),
    );

    expect(result).toEqual({
      rows: [
        {
          row_number: 3,
          name: "Vitamin C",
          category_name: "Hair",
          subcategory_name: "Conditioner",
          barcode: "8901000000012",
          unit: "box",
          is_active: true,
          description: "Effervescent",
        },
      ],
      rejected_rows: [
        {
          row_number: 2,
          name: "A",
          barcode: "8901000000011",
          reason: 'Column "name": wrong entry. Must be at least 2 characters.',
        },
      ],
      processed_count: 2,
    });
  });

  it("skips rows with invalid is_active values", () => {
    const result = parseProductImportCsv(
      [
        "name,category_name,subcategory_name,barcode,unit,is_active,description",
        "Paracetamol,Hair,Shampoo,8901000000011,box,maybe,Tablet strip",
        "Vitamin C,Hair,Conditioner,8901000000012,box,true,Effervescent",
      ].join("\n"),
    );

    expect(result).toEqual({
      rows: [
        {
          row_number: 3,
          name: "Vitamin C",
          category_name: "Hair",
          subcategory_name: "Conditioner",
          barcode: "8901000000012",
          unit: "box",
          is_active: true,
          description: "Effervescent",
        },
      ],
      rejected_rows: [
        {
          row_number: 2,
          name: "Paracetamol",
          barcode: "8901000000011",
          reason: 'Column "is_active": wrong entry. Use true/false, yes/no, or 1/0.',
        },
      ],
      processed_count: 2,
    });
  });

  it("reports missing required column data by column name", () => {
    const result = parseProductImportCsv(
      [
        "name,category_name,subcategory_name,barcode,unit,is_active,description",
        "Paracetamol,,Shampoo,8901000000011,,true,Tablet strip",
        "Vitamin C,Hair,Conditioner,8901000000012,box,true,Effervescent",
      ].join("\n"),
    );

    expect(result).toEqual({
      rows: [
        {
          row_number: 2,
          name: "Paracetamol",
          category_name: null,
          subcategory_name: null,
          barcode: "8901000000011",
          unit: "unit",
          is_active: true,
          description: "Tablet strip",
        },
        {
          row_number: 3,
          name: "Vitamin C",
          category_name: "Hair",
          subcategory_name: "Conditioner",
          barcode: "8901000000012",
          unit: "box",
          is_active: true,
          description: "Effervescent",
        },
      ],
      rejected_rows: [],
      processed_count: 2,
    });
  });
});
