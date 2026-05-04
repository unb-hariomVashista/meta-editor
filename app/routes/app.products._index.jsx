import { redirect } from "react-router";

export const loader = () => {
  return redirect("/app/products/import");
};
