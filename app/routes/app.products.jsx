import React from "react";
import { Outlet, useNavigate } from "react-router";

function Products() {
  const navigate = useNavigate();
  return (
    <>
      <s-section>
        <s-clickable onClick={() => navigate("/app/products/export")}>Export</s-clickable>
        <s-clickable onClick={() => navigate("/app/products/import")}>Import</s-clickable>
      </s-section>
      <Outlet />
    </>
  );
}

export default Products;
