import React from "react";
import { Outlet, useNavigate, useLocation } from "react-router";

export const loader = async ({ request }) => {
  const { authenticate } = await import("../shopify.server.js");
  await authenticate.admin(request);
  return null;
};

function Variants() {
  const navigate = useNavigate();
  const location = useLocation();

  const isExportActive = location.pathname.includes("export");
  const isImportActive = location.pathname.includes("import");

  const buttonStyle = (isActive) => ({
    padding: "8px 16px",
    borderRadius: "6px",
    border: "none",
    backgroundColor: isActive ? "#e4e5e7" : "transparent",
    color: isActive ? "#000" : "#5c5f62",
    fontWeight: isActive ? "600" : "400",
    cursor: "pointer",
    transition: "background-color 0.2s ease",
    fontSize: "14px",
  });

  return (
    <>
        <div style={{ display: "flex", gap: "8px", borderBottom: "1px solid #ebebeb", paddingBottom: "10px", marginBottom: "15px" }}>
          <button 
            style={buttonStyle(isExportActive)} 
            onClick={() => navigate("/app/variants/export")}
          >
            Export
          </button>
          <button 
            style={buttonStyle(isImportActive)} 
            onClick={() => navigate("/app/variants/import")}
          >
            Import
          </button>
        </div>
      <Outlet />
    </>
  );
}

export default Variants;
