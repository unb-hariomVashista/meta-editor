import { Form, useLoaderData, useNavigate } from "react-router";
import "../styles/product-export.css";
import { useEffect, useState } from "react";

export const loader = async ({ request }) => {
  const { authenticate } = await import("../shopify.server.js");
  const { admin } = await authenticate.admin(request);

  const url = new URL(request.url);
  const cursor = url.searchParams.get("cursor");
  const direction = url.searchParams.get("direction");

  let variables = {
    after: null,
    before: null,
    first: null,
    last: null,
  };

  if (direction == "prev") {
    variables.last = 25;
    variables.before = cursor;
  } else {
    variables.first = 25;
    variables.after = cursor;
  }
  const response = await admin.graphql(
    `
      query GetProducts($after: String, $before: String, $first: Int, $last: Int){
        products(first: $first, last: $last, after: $after, before: $before){
          nodes{
            id
            title
            status
            featuredMedia {
              alt
              preview {
                image {
                  url
                }
              }
            }
            metafields(first: 6) {
              nodes{
                namespace
                type
              }
            }
          }
          pageInfo {
            hasPreviousPage
            hasNextPage
            startCursor
            endCursor
          }
        }
      }
    `,
    { variables },
  );
  const json = await response.json();
  return json;
};

export const action = async ({ request }) => {
  const { authenticate } = await import("../shopify.server.js");
  const { admin } = await authenticate.admin(request);

  const formData = await request.formData();
  const idsJson = formData.get("ids") || "[]";
  const ids = JSON.parse(idsJson);

  const response = await admin.graphql(
    `
      query GetProductByIds($ids: [ID!]!) {
        nodes(ids: $ids) {
          ... on  Product {
            id
            handle
            title
            metafields(first: 50) {
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
    `,
    {
      variables: {
        ids: ids || null,
      },
    },
  );
  const json = await response.json();
  const products = json.data.nodes || [];

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

  products.forEach((product) => {
    if (!product) return;
    const metafields = product.metafields?.edges || [];
    metafields.forEach((field) => {
      rows.push([
        product.id,
        product.handle,
        product.title,
        field.node.namespace,
        field.node.key,
        field.node.type,
        field.node.value,
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
  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": 'attachment; filename="products-metafields.csv"',
    },
  });
};

function ProductExport() {
  const data = useLoaderData();
  const navigate = useNavigate();

  const [selectedProducts, setSelectedProducts] = useState(new Set());
  const pageIds = data.data.products.nodes.map((node) => {
    return node.id;
  });
  const isAllSelected =
    pageIds.length > 0 && pageIds.every((id) => selectedProducts.has(id));

  const handleNext = () => {
    const cursor = data.data.products.pageInfo.endCursor;
    navigate(`?cursor=${cursor}&direction=next`);
  };

  const handlePrev = () => {
    const cursor = data.data.products.pageInfo.startCursor;
    navigate(`?cursor=${cursor}&direction=prev`);
  };

  const handleSelection = (id) => {
    setSelectedProducts((prev) => {
      const newSet = new Set(prev);

      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };
  const handleAllSelection = (ids) => {
    setSelectedProducts((prev) => {
      const newSet = new Set(prev);
      const allSelected = ids.every((id) => newSet.has(id));

      if (allSelected) {
        ids.forEach((id) => newSet.delete(id));
      } else {
        ids.forEach((id) => newSet.add(id));
      }

      return newSet;
    });
  };

  const exportSelected = async () => {
    const ids = Array.from(selectedProducts);

    const response = await fetch("/app/products/export", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ids }),
    });
    console.log(response.headers.get("content-type"));
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);

    // const a = document.createElement("a");
    // a.href = url;
    // a.download = "products-metafields.csv";

    // document.body.appendChild(a);
    // a.click();

    // a.remove();
    window.URL.revokeObjectURL(url);
  };

  return (
    <div>
      <s-section>
        <div className="product-container">
          <div className="product-status-container">
            <s-clickable>All</s-clickable>
            <s-clickable>Active</s-clickable>
            <s-clickable>Draft</s-clickable>
          </div>
          <div className="export-buttons">
            <Form method="post" reloadDocument>
              <input
                type="hidden"
                name="ids"
                value={JSON.stringify(Array.from(selectedProducts))}
              />
              {selectedProducts.size > 0 ? (
                <button type="submit">
                  Export {selectedProducts.size} products
                </button>
              ) : null}
            </Form>
          </div>
        </div>
        <s-table>
          <s-table-header-row>
            <s-table-header></s-table-header>
            <s-table-header>Name</s-table-header>
            <s-table-header>Status</s-table-header>
            <s-table-header>Number of Metafields</s-table-header>
            <s-table-header>
              <input
                type="checkbox"
                checked={isAllSelected}
                onChange={() => handleAllSelection(pageIds)}
              />
            </s-table-header>
          </s-table-header-row>
          <s-table-body>
            {data.data.products.nodes.map((node) => {
              return (
                <s-table-row key={node.id}>
                  <s-table-cell>
                    <img
                      src={node.featuredMedia?.preview?.image?.url}
                      width={40}
                      height={40}
                    />
                  </s-table-cell>
                  <s-table-cell>{node.title}</s-table-cell>
                  <s-table-cell>{node.status}</s-table-cell>
                  <s-table-cell>
                    {node.metafields.nodes.length == 0
                      ? "0"
                      : node.metafields.nodes.length > 5
                        ? "5+"
                        : node.metafields.nodes.length}{" "}
                    metafields
                  </s-table-cell>
                  <s-table-cell>
                    <input
                      type="checkbox"
                      checked={selectedProducts.has(node.id)}
                      onChange={() => handleSelection(node.id)}
                    />
                  </s-table-cell>
                </s-table-row>
              );
            })}
          </s-table-body>
        </s-table>
        <div className="pagination-container">
          <button
            onClick={handlePrev}
            className="pagination-button"
            disabled={!data.data.products.pageInfo.hasPreviousPage}
          >
            Prev
          </button>
          <p>1-25</p>
          <button
            onClick={handleNext}
            className="pagination-button"
            disabled={!data.data.products.pageInfo.hasNextPage}
          >
            Next
          </button>
        </div>
      </s-section>
    </div>
  );
}

export default ProductExport;
