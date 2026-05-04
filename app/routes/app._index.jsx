import { useNavigate } from "react-router";
import styles from "../styles/index.css";

export default function Index() {
  const navigate = useNavigate();
  return (
    <s-page heading="Meta Editor">
      <div className="resource-container">
        <button className="resource-item" onClick={() => navigate("/app/products")}>
          <s-box >
            <img src="/products.png" width={250} height={200} />
            <h3 className="resource-name">Products</h3>
          </s-box>
        </button>
        <button className="resource-item" onClick={() => navigate("/app/variants")}>
          <s-box>
            <img src="/variants.png" width={250} height={200} />
            <h3 className="resource-name">Variants</h3>
          </s-box>
        </button>
      </div>
    </s-page>
  );
}

export function links() {
  return [{ rel: "stylesheet", href: styles }];
}
