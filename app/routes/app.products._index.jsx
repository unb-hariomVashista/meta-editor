import { redirect } from "react-router";

export const loader = async ({ request }) => {
  const { authenticate } = await import("../shopify.server.js");
  await authenticate.admin(request);
  return redirect("/app/products/export");
};
