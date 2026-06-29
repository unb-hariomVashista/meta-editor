import { Form, useLoaderData, useNavigate, useSearchParams } from "react-router";
import { useEffect, useState } from "react";
import { authenticate } from "../shopify.server.js";

export const loader = async ({ request }) => {
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
    <div className="page-section-container">
      {/* Search and Action Toolbar */}
      <div className="action-toolbar">
        <div className="toolbar-left">
          <div className="segmented-filter-control">
            <button className={`filter-btn ${currentType === "all" ? "active" : ""}`} onClick={() => handleFilter("all")}>All</button>
            <button className={`filter-btn ${currentType === "active" ? "active" : ""}`} onClick={() => handleFilter("active")}>Active</button>
            <button className={`filter-btn ${currentType === "draft" ? "active" : ""}`} onClick={() => handleFilter("draft")}>Draft</button>
          </div>
          
          <Form method="get" className="search-form-control" onSubmit={() => setSelectedProducts(new Set())}>
            <input type="hidden" name="type" value={currentType} />
            <input 
              type="text" 
              name="search" 
              key={searchQuery}
              placeholder="Search products..." 
              defaultValue={searchQuery}
              className="search-input"
            />
            <button type="submit" className="search-btn">Search</button>
            {searchQuery && (
              <button type="button" onClick={handleClearSearch} className="clear-btn">Clear</button>
            )}
          </Form>
        </div>

        <div className="toolbar-right">
          <button 
            onClick={exportAll} 
            disabled={isProcessingBulk}
            className="btn btn-outline"
          >
            {isProcessingBulk ? "Exporting..." : "Export All Products"}
          </button>
          {selectedProducts.size > 0 && (
            <button 
              onClick={exportSelected}
              disabled={isExportingSelected || isProcessingBulk}
              className="btn btn-primary"
            >
              {isExportingSelected ? "Exporting..." : `Export ${selectedProducts.size} selected`}
            </button>
          )}
        </div>
      </div>

      {/* Styled Grid / Table Container */}
      <div className="table-card">
        <table className="data-table">
          <thead>
            <tr>
              <th style={{ width: "60px" }}>Image</th>
              <th>Name</th>
              <th>Status</th>
              <th>Metafields</th>
              <th style={{ width: "40px" }}>
                <input
                  type="checkbox"
                  checked={isAllSelected}
                  onChange={() => handleAllSelection(pageIds)}
                />
              </th>
            </tr>
          </thead>
          <tbody>
            {data.products.nodes.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ textAlign: "center", padding: "40px" }}>
                  <p style={{ color: "#6d7175", margin: 0 }}>No products match your filters.</p>
                </td>
              </tr>
            ) : (
              data.products.nodes.map((node) => {
                return (
                  <tr key={node.id}>
                    <td>
                      {node.featuredMedia?.preview?.image?.url ? (
                        <img
                          src={node.featuredMedia.preview.image.url}
                          alt=""
                          width={40}
                          height={40}
                          className="table-product-img"
                        />
                      ) : (
                        <div className="table-product-img-placeholder" />
                      )}
                    </td>
                    <td className="table-title-cell">{node.title}</td>
                    <td>
                      <span className={`status-pill ${node.status.toLowerCase()}`}>
                        {node.status}
                      </span>
                    </td>
                    <td>
                      {node.metafields.nodes.length === 0
                        ? "0"
                        : node.metafields.nodes.length > 5
                          ? "5+"
                          : node.metafields.nodes.length}{" "}
                      metafields
                    </td>
                    <td>
                      <input
                        type="checkbox"
                        checked={selectedProducts.has(node.id)}
                        onChange={() => handleSelection(node.id)}
                      />
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Controls */}
      <div className="pagination-bar">
        <button
          onClick={handlePrev}
          className="pagination-btn"
          disabled={!data.products.pageInfo.hasPreviousPage}
        >
          &larr; Prev
        </button>
        <span className="pagination-text">Page Results</span>
        <button
          onClick={handleNext}
          className="pagination-btn"
          disabled={!data.products.pageInfo.hasNextPage}
        >
          Next &rarr;
        </button>
      </div>
    </div>
  );
}

export default ProductExport;
