import { authenticate } from "../shopify.server.js";
import prisma from "../db.server.js";

const fetchAllMetafields = async (admin, productId) => {
  let hasNextPage = true;
  let cursor = null;

  const metafields = [];

  while (hasNextPage) {
    const response = await admin.graphql(
      `
        query GetProductMetafields($id: ID!, $cursor: String) {
          product(id: $id) {
            metafields(first: 250, after: $cursor) {
              edges {
                cursor
                node {
                  namespace
                  key
                  type
                  value
                }
              }
              pageInfo {
                hasNextPage
                endCursor
              }
            }
          }
        }
      `,
      {
        variables: {
          id: productId,
          cursor,
        },
      },
    );

    const json = await response.json();
    const metafieldConnection = json.data.product.metafields;

    metafields.push(...metafieldConnection.edges.map((e) => e.node));
    hasNextPage = metafieldConnection.pageInfo.hasNextPage;
    cursor = metafieldConnection.pageInfo.endCursor;
  }

  return metafields;
};

export const action = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);

  const body = await request.json();
  const ids = body.ids || [];

  // Threshold for switching to Bulk Operation API
  const BULK_THRESHOLD = 50;

  if (ids.length > BULK_THRESHOLD) {
    return new Response(JSON.stringify({ strategy: "bulk", ids }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  const response = await admin.graphql(
    `
      query GetProductByIds($ids: [ID!]!) {
        nodes(ids: $ids) {
          ... on Product {
            id
            handle
            title
          }
        }
      }
    `,
    {
      variables: {
        ids: ids || null,
      },
    },
  );
  const json = await response.json();
  const products = json.data.nodes || [];

  const productsWithMetafields = await Promise.all(
    products.map(async (product) => {
      if (!product) return null;

      const metafields = await fetchAllMetafields(admin, product.id);

      return {
        ...product,
        metafields,
      };
    }),
  );
  
  const rows = [
    [
      "product gid",
      "product handle",
      "product title",
      "metafield namespace",
      "metafield key",
      "metafield type",
      "metafield value",
    ],
  ];

  productsWithMetafields.forEach((product) => {
    if (!product) return;

    if (product.metafields.length === 0) {
      rows.push([product.id, product.handle, product.title, "", "", "", ""]);
      return;
    }

    product.metafields.forEach((field) => {
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
  });
  
  const csv = rows
    .map((row) => {
      return row
        .map((value) => {
          return `"${String(value ?? "").replace(/"/g, '""')}"`;
        })
        .join(",");
    })
    .join("\n");
    
  try {
    await prisma.actionLog.create({
      data: {
        shop: session.shop,
        action: "PRODUCT_EXPORT",
        status: "SUCCESS",
        details: JSON.stringify({ itemsExported: products.length })
      }
    });
  } catch (err) {
    console.error("Failed to log export action:", err);
  }
    
  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": 'attachment; filename="products-metafields.csv"',
    },
  });
};
