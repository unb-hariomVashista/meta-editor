import { authenticate } from "../shopify.server.js";

export const action = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  const body = await request.json();
  const { type, ids } = body;

  let query = "";
  if (type === "products") {
    const filter = ids && ids.length > 0 
      ? `(query: "${ids.map(id => `id:${id}`).join(' OR ')}")` 
      : "";
    
    query = `
      {
        products${filter} {
          edges {
            node {
              id
              handle
              title
              metafields {
                edges {
                  node {
                    namespace
                    key
                    type
                    value
                  }
                }
              }
            }
          }
        }
      }
    `;
  } else {
    const filter = ids && ids.length > 0 
      ? `(query: "${ids.map(id => `id:${id}`).join(' OR ')}")` 
      : "";

    query = `
      {
        productVariants${filter} {
          edges {
            node {
              id
              title
              product {
                id
                handle
                title
              }
              metafields {
                edges {
                  node {
                    namespace
                    key
                    type
                    value
                  }
                }
              }
            }
          }
        }
      }
    `;
  }

  const response = await admin.graphql(
    `
      mutation bulkOperationRunQuery($query: String!) {
        bulkOperationRunQuery(query: $query) {
          bulkOperation {
            id
            status
          }
          userErrors {
            field
            message
          }
        }
      }
    `,
    { variables: { query } }
  );

  const json = await response.json();
  return json;
};
