import { authenticate } from "../shopify.server.js";
import prisma from "../db.server.js";

export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const body = await request.json();
  const { url, type } = body;

  const res = await fetch(url);
  const text = await res.text();
  
  const lines = text.trim().split("\n");
  const nodes = {};

  // Parse JSONL
  lines.forEach(line => {
    if (!line) return;
    const obj = JSON.parse(line);
    // In bulk operation JSONL, child objects (like metafields) have an `__parentId`.
    if (obj.__parentId) {
      if (!nodes[obj.__parentId].metafields) {
        nodes[obj.__parentId].metafields = [];
      }
      nodes[obj.__parentId].metafields.push(obj);
    } else {
      nodes[obj.id] = { ...obj, metafields: [] };
    }
  });

  // Convert to CSV
  let rows = [];
  if (type === "products") {
    rows.push([
      "product gid",
      "product handle",
      "product title",
      "metafield namespace",
      "metafield key",
      "metafield type",
      "metafield value",
    ]);

    Object.values(nodes).forEach(product => {
      if (!product.metafields || product.metafields.length === 0) {
        rows.push([product.id, product.handle, product.title, "", "", "", ""]);
      } else {
        product.metafields.forEach(field => {
          rows.push([
            product.id,
            product.handle,
            product.title,
            field.namespace,
            field.key,
            field.type,
            field.value,
          ]);
        });
      }
    });
  } else {
    rows.push([
      "variant gid",
      "variant title",
      "product handle",
      "product title",
      "metafield namespace",
      "metafield key",
      "metafield type",
      "metafield value",
    ]);

    Object.values(nodes).forEach(variant => {
      const productHandle = variant.product?.handle || "";
      const productTitle = variant.product?.title || "";

      if (!variant.metafields || variant.metafields.length === 0) {
        rows.push([variant.id, variant.title, productHandle, productTitle, "", "", "", ""]);
      } else {
        variant.metafields.forEach(field => {
          rows.push([
            variant.id,
            variant.title,
            productHandle,
            productTitle,
            field.namespace,
            field.key,
            field.type,
            field.value,
          ]);
        });
      }
    });
  }

  const csv = rows
    .map((row) => row.map((value) => `"${String(value ?? "").replace(/"/g, '""')}"`).join(","))
    .join("\n");
    
  try {
    await prisma.actionLog.create({
      data: {
        shop: session.shop,
        action: type === "products" ? "PRODUCT_EXPORT_ALL" : "VARIANT_EXPORT_ALL",
        status: "SUCCESS",
        details: JSON.stringify({ itemsExported: Object.keys(nodes).length })
      }
    });
  } catch (err) {
    console.error("Failed to log export action:", err);
  }
    
  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="${type}-all-metafields.csv"`,
    },
  });
};
