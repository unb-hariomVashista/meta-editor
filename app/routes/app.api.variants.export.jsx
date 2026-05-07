import { authenticate } from "../shopify.server.js";

const fetchAllVariantMetafields = async (admin, variantId) => {
  let hasNextPage = true;
  let cursor = null;
  const metafields = [];

  while (hasNextPage) {
    const response = await admin.graphql(
      `
        query GetVariantMetafields($id: ID!, $cursor: String) {
          productVariant(id: $id) {
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
      { variables: { id: variantId, cursor } }
    );

    const json = await response.json();
    const metafieldConnection = json.data?.productVariant?.metafields;
    if (!metafieldConnection) break;

    metafields.push(...metafieldConnection.edges.map((e) => e.node));
    hasNextPage = metafieldConnection.pageInfo.hasNextPage;
    cursor = metafieldConnection.pageInfo.endCursor;
  }

  return metafields;
};

export const action = async ({ request }) => {
  const { admin } = await authenticate.admin(request);

  const body = await request.json();
  const ids = body.ids || [];

  const response = await admin.graphql(
    `
      query GetVariantByIds($ids: [ID!]!) {
        nodes(ids: $ids) {
          ... on ProductVariant {
            id
            title
            product {
              id
              handle
              title
            }
          }
        }
      }
    `,
    { variables: { ids: ids || null } }
  );
  
  const json = await response.json();
  const variants = json.data.nodes || [];

  const variantsWithMetafields = await Promise.all(
    variants.map(async (variant) => {
      if (!variant) return null;
      const metafields = await fetchAllVariantMetafields(admin, variant.id);
      return { ...variant, metafields };
    })
  );
  
  const rows = [
    [
      "variant gid",
      "variant title",
      "product handle",
      "product title",
      "metafield namespace",
      "metafield key",
      "metafield type",
      "metafield value",
    ],
  ];

  variantsWithMetafields.forEach((variant) => {
    if (!variant) return;

    if (variant.metafields.length === 0) {
      rows.push([
        variant.id, 
        variant.title, 
        variant.product.handle, 
        variant.product.title, 
        "", "", "", ""
      ]);
      return;
    }

    variant.metafields.forEach((field) => {
      rows.push([
        variant.id,
        variant.title,
        variant.product.handle,
        variant.product.title,
        field.namespace,
        field.key,
        field.type,
        field.value,
      ]);
    });
  });
  
  const csv = rows
    .map((row) => row.map((value) => `"${String(value ?? "").replace(/"/g, '""')}"`).join(","))
    .join("\n");
    
  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": 'attachment; filename="variants-metafields.csv"',
    },
  });
};
