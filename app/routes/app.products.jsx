import React from "react";
import { Outlet, useNavigate, useLocation } from "react-router";

export const loader = async ({ request }) => {
  const { authenticate } = await import("../shopify.server.js");
  await authenticate.admin(request);
  return null;
};

function Products() {
  const navigate = useNavigate();
  const location = useLocation();

  const isExportActive = location.pathname.includes("export");
  const isImportActive = location.pathname.includes("import");

  return (
    <>
      <div className="tab-navigation-bar">
        <button 
          className={`nav-tab-btn ${isExportActive ? "active" : ""}`}
          onClick={() => navigate("/app/products/export")}
        >
          Export Metafields
        </button>
        <button 
          className={`nav-tab-btn ${isImportActive ? "active" : ""}`}
          onClick={() => navigate("/app/products/import")}
        >
          Import Metafields
        </button>
      </div>
      <Outlet />
    </>
  );
}

export default Products;
