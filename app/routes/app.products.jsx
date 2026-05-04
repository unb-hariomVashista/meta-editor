import React from 'react'
import { Outlet } from 'react-router'



function Products() {
  return (
    <>
      <s-clickable>Import</s-clickable>
      <s-clickable>Export</s-clickable>
      <Outlet />
    </>
  )
}

export default Products
