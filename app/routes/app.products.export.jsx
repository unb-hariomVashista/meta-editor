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
  const search = url.searchParams.get("search") || "";
  
  let queryParts = [];
  if (type === "active") queryParts.push("status:active");
  if (type === "draft") queryParts.push("status:draft");
  
  if (search) {
    const safeSearch = search.replace(/"/g, '');
    queryParts.push(`(title:*${safeSearch}* OR sku:*${safeSearch}* OR handle:*${safeSearch}*)`);
  }
  
  if (queryParts.length > 0) {
    variables.query = queryParts.join(" AND ");
  }

  // Check for active bulk operation
  const bulkResponse = await admin.graphql(`
    query {
      currentBulkOperation {
        id
        status
      }
    }
  `);
  const bulkJson = await bulkResponse.json();

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
  
  return {
    products: json.data.products,
    currentBulkOperation: bulkJson.data.currentBulkOperation
  };
};



function ProductExport() {
  const data = useLoaderData();
  const navigate = useNavigate();

  const [searchParams] = useSearchParams();
  const currentType = searchParams.get("type") || "all";
  const searchQuery = searchParams.get("search") || "";

  const [selectedProducts, setSelectedProducts] = useState(new Set());
  const [isProcessingBulk, setIsProcessingBulk] = useState(false);
  const pageIds = data.products.nodes.map((node) => {
    return node.id;
  });
  const isAllSelected =
    pageIds.length > 0 && pageIds.every((id) => selectedProducts.has(id));

  const handleNext = () => {
    const cursor = data.products.pageInfo.endCursor;
    navigate(`?cursor=${cursor}&direction=next&type=${currentType}${searchQuery ? `&search=${encodeURIComponent(searchQuery)}` : ""}`);
  };

  const handlePrev = () => {
    const cursor = data.products.pageInfo.startCursor;
    navigate(`?cursor=${cursor}&direction=prev&type=${currentType}${searchQuery ? `&search=${encodeURIComponent(searchQuery)}` : ""}`);
  };

  const handleFilter = (type) => {
    navigate(`?type=${type}${searchQuery ? `&search=${encodeURIComponent(searchQuery)}` : ""}`);
    setSelectedProducts(new Set()); // Reset selection on filter change
  };

  const handleClearSearch = () => {
    navigate(`?type=${currentType}`);
    setSelectedProducts(new Set());
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

  const [isExportingSelected, setIsExportingSelected] = useState(false);

  const exportSelected = async () => {
    const ids = Array.from(selectedProducts);
    setIsExportingSelected(true);

    try {
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
        setIsExportingSelected(false);
        return;
      }

      const contentType = response.headers.get("content-type");
      if (contentType && contentType.includes("application/json")) {
        const data = await response.json();
        if (data.strategy === "bulk") {
          // Switch to bulk polling logic
          setIsProcessingBulk(true);
          await handleBulkExportProcess("products", data.ids);
          setIsProcessingBulk(false);
          setIsExportingSelected(false);
          return;
        }
      }

      // Direct download (small selection)
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
    setIsExportingSelected(false);
  };

  const handleBulkExportProcess = async (type, ids = null) => {
    const token = await window.shopify.idToken();
    let res = await fetch("/app/api/bulk-export/start", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
      body: JSON.stringify({ type, ids })
    });
    let json = await res.json();
    
    if (json.data?.bulkOperationRunQuery?.userErrors?.length > 0) {
      throw new Error(json.data.bulkOperationRunQuery.userErrors[0].message);
    }

    let status = "RUNNING";
    let url = null;
    while (status === "RUNNING" || status === "CREATED") {
      await new Promise(resolve => setTimeout(resolve, 3000));
      let pollRes = await fetch("/app/api/bulk-export/poll", {
         headers: { "Authorization": `Bearer ${token}` }
      });
      let pollJson = await pollRes.json();
      const op = pollJson.data?.currentBulkOperation;
      if (!op) throw new Error("Could not find bulk operation.");
      
      status = op.status;
      if (status === "COMPLETED") {
        url = op.url;
        break;
      } else if (status === "FAILED" || status === "CANCELED") {
        throw new Error(`Bulk operation ${status.toLowerCase()}.`);
      }
    }

    if (url) {
      let dlRes = await fetch("/app/api/bulk-export/download", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify({ type, url })
      });
      
      if (!dlRes.ok) throw new Error("Failed to generate CSV");
      
      const blob = await dlRes.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = `${type}-metafields.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(blobUrl);
    } else {
      alert("No data found to export.");
    }
  };

  const exportAll = async () => {
    setIsProcessingBulk(true);
    try {
      await handleBulkExportProcess("products");
    } catch (e) {
      console.error(e);
      alert("Error exporting all products: " + e.message);
    }
    setIsProcessingBulk(false);
  };

  useEffect(() => {
    const op = data.currentBulkOperation;
    if (op && (op.status === "RUNNING" || op.status === "CREATED")) {
      setIsProcessingBulk(true);
      handleBulkExportProcess("products");
    }
  }, []);

  return (
    <div>
      <s-section>
        <div className="product-container" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "15px" }}>
          <div style={{ display: "flex", gap: "15px", alignItems: "center" }}>
            <div className="product-status-container" style={{ display: "flex", gap: "4px" }}>
              <button style={buttonStyle(currentType === "all")} onClick={() => handleFilter("all")}>All</button>
              <button style={buttonStyle(currentType === "active")} onClick={() => handleFilter("active")}>Active</button>
              <button style={buttonStyle(currentType === "draft")} onClick={() => handleFilter("draft")}>Draft</button>
            </div>
            <Form method="get" style={{ display: "flex", gap: "5px" }} onSubmit={() => setSelectedProducts(new Set())}>
              <input type="hidden" name="type" value={currentType} />
              <input 
                type="text" 
                name="search" 
                key={searchQuery}
                placeholder="Search SKUs, handles, titles..." 
                defaultValue={searchQuery}
                style={{ padding: "6px 12px", borderRadius: "6px", border: "1px solid #ccc", width: "250px", fontSize: "14px" }}
              />
              <button type="submit" style={{ padding: "6px 12px", borderRadius: "6px", border: "1px solid #ccc", background: "#f4f6f8", cursor: "pointer", fontSize: "14px" }}>Search</button>
              {searchQuery && (
                <button type="button" onClick={handleClearSearch} style={{ padding: "6px 12px", borderRadius: "6px", border: "1px solid #ccc", background: "#fff", cursor: "pointer", fontSize: "14px", color: "#d22d2d" }}>Clear</button>
              )}
            </Form>
          </div>
          <div className="export-buttons" style={{ display: "flex", gap: "10px" }}>
            <button 
              onClick={exportAll} 
              disabled={isProcessingBulk}
              style={{
                padding: "6px 12px",
                borderRadius: "6px",
                border: "1px solid #ccc",
                background: isProcessingBulk ? "#e4e5e7" : "#fff",
                cursor: isProcessingBulk ? "not-allowed" : "pointer",
                fontSize: "14px"
              }}
            >
              {isProcessingBulk ? "Exporting... (this may take a while)" : "Export All Products"}
            </button>
            {selectedProducts.size > 0 ? (
              <button 
                onClick={exportSelected}
                disabled={isExportingSelected || isProcessingBulk}
                style={{
                  padding: "6px 12px",
                  borderRadius: "6px",
                  border: "none",
                  background: (isExportingSelected || isProcessingBulk) ? "#e4e5e7" : "#000",
                  color: (isExportingSelected || isProcessingBulk) ? "#8c9196" : "#fff",
                  cursor: (isExportingSelected || isProcessingBulk) ? "not-allowed" : "pointer",
                  fontSize: "14px",
                  fontWeight: "600"
                }}
              >
                {isExportingSelected ? "Exporting..." : `Export ${selectedProducts.size} selected`}
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
            {data.products.nodes.map((node) => {
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
            disabled={!data.products.pageInfo.hasPreviousPage}
          >
            <svg style={{ marginRight: "6px" }} width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>
            Prev
          </button>
          <span className="pagination-info">Page Results</span>
          <button
            onClick={handleNext}
            className="pagination-button"
            disabled={!data.products.pageInfo.hasNextPage}
          >
            Next
            <svg style={{ marginLeft: "6px" }} width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
          </button>
        </div>
      </s-section>
    </div>
  );
}

export default ProductExport;
