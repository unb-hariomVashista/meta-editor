import { useLoaderData, useNavigate } from "react-router";
import "../styles/product-export.css";

export const loader = async ({ request }) => {
  const { authenticate } = await import("../shopify.server.js");
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
  const response = await admin.graphql(
    `
      query GetProducts($after: String, $before: String, $first: Int, $last: Int){
        products(first: $first, last: $last, after: $after, before: $before){
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
  return json;
};

function ProductExport() {
  const data = useLoaderData();
  const navigate = useNavigate();
  console.log(data);

  const handleNext = () => {
    const cursor = data.data.products.pageInfo.endCursor;
    navigate(`?cursor=${cursor}&direction=next`);
  };

  const handlePrev = () => {
    const cursor = data.data.products.pageInfo.startCursor;
    navigate(`?cursor=${cursor}&direction=prev`);
  };

  return (
    <div>
      <s-section>
        <div className="product-status">
          <s-clickable>All</s-clickable>
          <s-clickable>Active</s-clickable>
          <s-clickable>Draft</s-clickable>
        </div>
        <s-table>
          <s-table-header-row>
            <s-table-header></s-table-header>
            <s-table-header>Name</s-table-header>
            <s-table-header>Status</s-table-header>
            <s-table-header>Number of Metafields</s-table-header>
          </s-table-header-row>
          <s-table-body>
            {data.data.products.nodes.map((node) => {
              return (
                <s-table-row key={node.id}>
                  <s-table-cell>
                    <img
                      src={node.featuredMedia?.preview?.image?.url}
                      width={40}
                      height={40}
                    />
                  </s-table-cell>
                  <s-table-cell>{node.title}</s-table-cell>
                  <s-table-cell>{node.status}</s-table-cell>
                  <s-table-cell>
                    {node.metafields.nodes.length == 0
                      ? "0"
                      : node.metafields.nodes.length > 5
                        ? "5+"
                        : node.metafields.nodes.length}{" "}
                    metafields
                  </s-table-cell>
                </s-table-row>
              );
            })}
          </s-table-body>
        </s-table>
        <div className="pagination-container">
          <button
            onClick={handlePrev}
            className="pagination-button"
            disabled={!data.data.products.pageInfo.hasPreviousPage}
          >
            Prev
          </button>
          <p>1-25</p>
          <button
            onClick={handleNext}
            className="pagination-button"
            disabled={!data.data.products.pageInfo.hasNextPage}
          >
            Next
          </button>
        </div>
      </s-section>
      <s-button>Export metafield</s-button>
    </div>
  );
}

export default ProductExport;
