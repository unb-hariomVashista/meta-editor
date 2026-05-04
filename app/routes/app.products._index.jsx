import React from 'react'
import { redirect, useLoaderData } from 'react-router'

const loader = async()=>{
  redirect("/app/products/import  ")
}

function ProductIndex() {
  const data = useLoaderData();
  return (
    <></>
  )
}

export default ProductIndex
