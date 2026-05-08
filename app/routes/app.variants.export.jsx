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
  
  return {
    products: json.data.products,
    currentBulkOperation: bulkJson.data.currentBulkOperation
  };
};


function VariantExport() {
  const data = useLoaderData();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const searchQuery = searchParams.get("search") || "";

  const [selectedProducts, setSelectedProducts] = useState(new Set());
  const [isProcessingBulk, setIsProcessingBulk] = useState(false);
  const pageIds = data.products.nodes.flatMap((node) =>
    node.variants.nodes.map((variant) => variant.id),
  );
  const isAllSelected =
    pageIds.length > 0 && pageIds.every((id) => selectedProducts.has(id));

  const handleNext = () => {
    const cursor = data.products.pageInfo.endCursor;
    navigate(`?cursor=${cursor}&direction=next${searchQuery ? `&search=${encodeURIComponent(searchQuery)}` : ""}`);
  };

  const handlePrev = () => {
    const cursor = data.products.pageInfo.startCursor;
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

  const [isExportingSelected, setIsExportingSelected] = useState(false);

  const exportSelected = async () => {
    const ids = Array.from(selectedProducts);
    setIsExportingSelected(true);

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
        setIsExportingSelected(false);
        return;
      }

      const contentType = response.headers.get("content-type");
      if (contentType && contentType.includes("application/json")) {
        const data = await response.json();
        if (data.strategy === "bulk") {
          setIsProcessingBulk(true);
          await handleBulkExportProcess("variants", data.ids);
          setIsProcessingBulk(false);
          setIsExportingSelected(false);
          return;
        }
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
      await handleBulkExportProcess("variants");
    } catch (e) {
      console.error(e);
      alert("Error exporting all variants: " + e.message);
    }
    setIsProcessingBulk(false);
  };

  useEffect(() => {
    const op = data.currentBulkOperation;
    if (op && (op.status === "RUNNING" || op.status === "CREATED")) {
      setIsProcessingBulk(true);
      handleBulkExportProcess("variants");
    }
  }, []);

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
              {isProcessingBulk ? "Exporting... (this may take a while)" : "Export All Variants"}
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
            {data.products.nodes.map((node) => {
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

export default VariantExport;
