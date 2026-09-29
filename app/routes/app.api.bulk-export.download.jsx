import { authenticate } from "../shopify.server.js";
import prisma from "../db.server.js";
import { fetchMetafieldDefinitions, mergeMetafields } from "../metafields.server.js";

export const action = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const body = await request.json();
  const { url, type, ids } = body;

  const res = await fetch(url);
  const text = await res.text();
  
  const lines = text.trim().split("\n");
  const nodes = {};

  // Parse JSONL safely
  const parentChildMap = {};
  lines.forEach(line => {
    if (!line) return;
    try {
      const obj = JSON.parse(line);
      if (obj.__parentId) {
        if (!parentChildMap[obj.__parentId]) {
          parentChildMap[obj.__parentId] = [];
        }
        parentChildMap[obj.__parentId].push(obj);
      } else if (obj.id) {
        nodes[obj.id] = { ...obj, metafields: [] };
      }
    } catch (e) {
      console.warn("Skipping unparseable line:", line);
    }
  });

  Object.keys(parentChildMap).forEach(parentId => {
    if (nodes[parentId]) {
      nodes[parentId].metafields = parentChildMap[parentId];
    }
  });


  const ownerType = type === "products" ? "PRODUCT" : "PRODUCTVARIANT";
  const definitions = await fetchMetafieldDefinitions(admin, ownerType);

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
      const mergedMetafields = mergeMetafields(definitions, product.metafields || []);

      if (mergedMetafields.length === 0) {
        rows.push([product.id, product.handle, product.title, "", "", "", ""]);
      } else {
        mergedMetafields.forEach(field => {
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
      const mergedMetafields = mergeMetafields(definitions, variant.metafields || []);

      if (mergedMetafields.length === 0) {
        rows.push([variant.id, variant.title, productHandle, productTitle, "", "", "", ""]);
      } else {
        mergedMetafields.forEach(field => {
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
    const hasFilter = ids && ids.length > 0;
    const actionName = hasFilter
      ? (type === "products" ? "PRODUCT_EXPORT" : "VARIANT_EXPORT")
      : (type === "products" ? "PRODUCT_EXPORT_ALL" : "VARIANT_EXPORT_ALL");

    await prisma.actionLog.create({
      data: {
        shop: session.shop,
        action: actionName,
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
