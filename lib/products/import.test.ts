import { describe, expect, it } from "vitest";

import {
  buildProductImportTemplateCsv,
  parseProductImportCsv,
  PRODUCT_IMPORT_MAX_ROWS,
  ProductImportError,
} from "@/lib/products/import";

describe("product csv import helpers", () => {
  it("builds template headers", () => {
    expect(buildProductImportTemplateCsv()).toBe(
      "name,category_name,subcategory_name,barcode,unit,is_active,description\n",
    );
  });

  it("parses valid csv rows", () => {
    const rows = parseProductImportCsv(
      [
        "name,category_name,subcategory_name,barcode,unit,is_active,description",
        "Paracetamol,Hair,Shampoo,8901000000011,box,true,Tablet strip",
        "Vitamin C,Hair,Conditioner,,box,no,Effervescent",
      ].join("\n"),
    );

    expect(rows).toEqual([
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
    ]);
  });

  it("rejects csv missing required headers", () => {
    expect(() =>
      parseProductImportCsv("name,category_name,barcode\nParacetamol,Hair,123"),
    ).toThrowError(ProductImportError);
  });

  it("rejects csv larger than max rows", () => {
    const lines = ["name,category_name,subcategory_name,barcode,unit,is_active,description"];
    for (let index = 0; index < PRODUCT_IMPORT_MAX_ROWS + 1; index += 1) {
      lines.push(`Product ${index},Hair,Shampoo,,unit,true,`);
    }

    expect(() => parseProductImportCsv(lines.join("\n"))).toThrowError(
      ProductImportError,
    );
  });
});
