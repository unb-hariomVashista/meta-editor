import { Form, useLoaderData, useNavigate, useSearchParams } from "react-router";
import "../styles/product-export.css";
import { useEffect, useState } from "react";

export const loader = async ({ request }) => {
  const { authenticate } = await import("../shopify.server.js");
  const { admin } = await authenticate.admin(request);

  const url = new URL(request.url);
  const cursor = url.searchParams.get("cursor");
  const direction = url.searchParams.get("direction");
  const search = url.searchParams.get("search") || "";

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

  if (search) {
    const safeSearch = search.replace(/"/g, '');
    variables.query = `(title:*${safeSearch}* OR sku:*${safeSearch}* OR handle:*${safeSearch}*)`;
  }

  const response = await admin.graphql(
    `
      query GetProducts($after: String, $before: String, $first: Int, $last: Int, $query: String){
        products(first: $first, last: $last, after: $after, before: $before, query: $query){
          nodes{
            id
            title
            featuredMedia {
              preview {
                image {
                  url
                }
              }
            }
            variants(first: 50) {
              nodes {
                id
                title
                media(first: 1) {
                  nodes {
                    preview {
                      image {
                        url
                      }
                    }
                  }
                }
                metafields(first: 25) {
                  nodes {
                    id
                    namespace
                    key
                    type
                    value
                  }
                }
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


function VariantExport() {
  const data = useLoaderData();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const searchQuery = searchParams.get("search") || "";

  const [selectedProducts, setSelectedProducts] = useState(new Set());
  const pageIds = data.data.products.nodes.flatMap((node) =>
    node.variants.nodes.map((variant) => variant.id),
  );
  const isAllSelected =
    pageIds.length > 0 && pageIds.every((id) => selectedProducts.has(id));

  const handleNext = () => {
    const cursor = data.data.products.pageInfo.endCursor;
    navigate(`?cursor=${cursor}&direction=next${searchQuery ? `&search=${encodeURIComponent(searchQuery)}` : ""}`);
  };

  const handlePrev = () => {
    const cursor = data.data.products.pageInfo.startCursor;
    navigate(`?cursor=${cursor}&direction=prev${searchQuery ? `&search=${encodeURIComponent(searchQuery)}` : ""}`);
  };

  const handleClearSearch = () => {
    navigate(`?`);
    setSelectedProducts(new Set());
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

    try {
      const token = await window.shopify.idToken();

      const response = await fetch("/app/api/variants/export", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({ ids }),
      });

      if (!response.ok) {
        console.error("Export failed:", response.status, response.statusText);
        alert("Failed to export variants. Please try again.");
        return;
      }

      const contentType = response.headers.get("content-type");
      if (contentType && contentType.includes("text/html")) {
        console.error("Export failed: Received HTML instead of CSV.");
        alert("Export failed: Received HTML instead of CSV.");
        return;
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);

      const a = document.createElement("a");
      a.href = url;
      a.download = "variants-metafields.csv";

      document.body.appendChild(a);
      a.click();

      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Error during export:", error);
      alert("An error occurred during export.");
    }
  };

  return (
    <div>
      <s-section>
        <div className="product-container" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "15px" }}>
          <Form method="get" style={{ display: "flex", gap: "5px" }} onSubmit={() => setSelectedProducts(new Set())}>
            <input 
              type="text" 
              name="search" 
              key={searchQuery}
              placeholder="Search SKUs, handles, titles..." 
              defaultValue={searchQuery}
              style={{ padding: "6px 12px", borderRadius: "6px", border: "1px solid #ccc", width: "300px", fontSize: "14px" }}
            />
            <button type="submit" style={{ padding: "6px 12px", borderRadius: "6px", border: "1px solid #ccc", background: "#f4f6f8", cursor: "pointer", fontSize: "14px" }}>Search</button>
            {searchQuery && (
              <button type="button" onClick={handleClearSearch} style={{ padding: "6px 12px", borderRadius: "6px", border: "1px solid #ccc", background: "#fff", cursor: "pointer", fontSize: "14px", color: "#d22d2d" }}>Clear</button>
            )}
          </Form>
          <div className="export-buttons">
            {selectedProducts.size > 0 ? (
              <button onClick={exportSelected}>
                Export {selectedProducts.size} variants
              </button>
            ) : null}
          </div>
        </div>
        <s-table>
          <s-table-header-row>
            <s-table-header></s-table-header>
            <s-table-header>Variant Name</s-table-header>
            <s-table-header>Product</s-table-header>
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
              return node.variants.nodes.map((variant) => {
                return (
                  <s-table-row key={variant.id}>
                    <s-table-cell>
                      <img
                        src={variant.media?.nodes?.[0]?.preview?.image?.url || node.featuredMedia?.preview?.image?.url || ""}
                        width={40}
                        height={40}
                      />
                    </s-table-cell>
                    <s-table-cell>{variant.title}</s-table-cell>
                    <s-table-cell>{node.title}</s-table-cell>
                    <s-table-cell>
                      {variant.metafields.nodes.length == 0
                        ? "0"
                        : variant.metafields.nodes.length > 5
                          ? "5+"
                          : variant.metafields.nodes.length}{" "}
                      metafields
                    </s-table-cell>
                    <s-table-cell>
                      <input
                        type="checkbox"
                        checked={selectedProducts.has(variant.id)}
                        onChange={() => handleSelection(variant.id)}
                      />
                    </s-table-cell>
                  </s-table-row>
                );
              });
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

export default VariantExport;
