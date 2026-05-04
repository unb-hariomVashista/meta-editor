import React from "react";
import { Outlet } from "react-router";

function Products() {
  return (
    <>
      <s-section>
        <s-clickable>Export</s-clickable>
        <s-clickable>Import</s-clickable>
      </s-section>
      <Outlet />
    </>
  );
}

export default Products;
