import { Form, useLoaderData, useNavigate, useSearchParams } from "react-router";
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
  const type = url.searchParams.get("type") || "all";
  if (type === "active") variables.query = "status:active";
  if (type === "draft") variables.query = "status:draft";

  const response = await admin.graphql(
    `
      query GetProducts($after: String, $before: String, $first: Int, $last: Int, $query: String){
        products(first: $first, last: $last, after: $after, before: $before, query: $query){
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



function ProductExport() {
  const data = useLoaderData();
  const navigate = useNavigate();

  const [searchParams] = useSearchParams();
  const currentType = searchParams.get("type") || "all";

  const [selectedProducts, setSelectedProducts] = useState(new Set());
  const pageIds = data.data.products.nodes.map((node) => {
    return node.id;
  });
  const isAllSelected =
    pageIds.length > 0 && pageIds.every((id) => selectedProducts.has(id));

  const handleNext = () => {
    const cursor = data.data.products.pageInfo.endCursor;
    navigate(`?cursor=${cursor}&direction=next&type=${currentType}`);
  };

  const handlePrev = () => {
    const cursor = data.data.products.pageInfo.startCursor;
    navigate(`?cursor=${cursor}&direction=prev&type=${currentType}`);
  };

  const handleFilter = (type) => {
    navigate(`?type=${type}`);
    setSelectedProducts(new Set()); // Reset selection on filter change
  };

  const buttonStyle = (isActive) => ({
    padding: "6px 12px",
    borderRadius: "6px",
    border: "none",
    backgroundColor: isActive ? "#e4e5e7" : "transparent",
    color: isActive ? "#000" : "#5c5f62",
    fontWeight: isActive ? "600" : "400",
    cursor: "pointer",
    transition: "background-color 0.2s ease",
    fontSize: "14px",
  });

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
      // Manually retrieve the App Bridge session token to ensure the request is authenticated
      const token = await window.shopify.idToken();

      const response = await fetch("/app/api/products/export", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({ ids }),
      });

      if (!response.ok) {
        console.error("Export failed:", response.status, response.statusText);
        alert("Failed to export products. Please try again.");
        return;
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);

      const a = document.createElement("a");
      a.href = url;
      a.download = "products-metafields.csv";

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
        <div className="product-container">
          <div className="product-status-container" style={{ display: "flex", gap: "4px" }}>
            <button style={buttonStyle(currentType === "all")} onClick={() => handleFilter("all")}>All</button>
            <button style={buttonStyle(currentType === "active")} onClick={() => handleFilter("active")}>Active</button>
            <button style={buttonStyle(currentType === "draft")} onClick={() => handleFilter("draft")}>Draft</button>
          </div>
          <div className="export-buttons">
            {selectedProducts.size > 0 ? (
              <button onClick={exportSelected}>
                Export {selectedProducts.size} products
              </button>
            ) : null}
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
