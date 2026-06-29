import { useLoaderData, useNavigate } from "react-router";
import { authenticate } from "../shopify.server.js";
import prisma from "../db.server.js";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);

  try {
    const recentLogs = await prisma.actionLog.findMany({
      where: { shop: session.shop },
      orderBy: { createdAt: "desc" },
      take: 5,
    });

    // Map logs to plain JSON objects (dates to ISO strings)
    const serializedLogs = recentLogs.map(log => ({
      ...log,
      createdAt: log.createdAt.toISOString()
    }));

    return { recentLogs: serializedLogs };
  } catch (e) {
    console.error("Failed to load dashboard statistics:", e);
    return { recentLogs: [] };
  }
};

export default function Index() {
  const { recentLogs } = useLoaderData();
  const navigate = useNavigate();

  return (
    <s-page heading="Meta Editor Dashboard">

      {/* Main Feature Launchers */}
      <div className="dashboard-section-header">
        <h2>Quick Launch Tools</h2>
        <p>Select a resource below to edit or export metafields & metaobjects</p>
      </div>

      <div className="resource-container">
        <button className="resource-item-new" onClick={() => navigate("/app/products")}>
          <div className="image-wrapper">
            <img src="/products.png" alt="Products" className="resource-img" width={250} height={200} />
          </div>
          <div className="card-info">
            <h3 className="resource-title">Products Editor</h3>
            <p className="resource-desc">Bulk edit and export product metafields, schemas, and descriptions.</p>
            <span className="card-action-btn">Open Editor &rarr;</span>
          </div>
        </button>

        <button className="resource-item-new" onClick={() => navigate("/app/variants")}>
          <div className="image-wrapper">
            <img src="/variants.png" alt="Variants" className="resource-img" width={250} height={200} />
          </div>
          <div className="card-info">
            <h3 className="resource-title">Variants Editor</h3>
            <p className="resource-desc">Manage custom variant pricing, sizes, options, and metafield values.</p>
            <span className="card-action-btn">Open Editor &rarr;</span>
          </div>
        </button>
      </div>

      {/* Recent Activity Feed */}
      <div className="dashboard-section-header activity-header">
        <h2>Recent Activity Logs</h2>
        <button className="view-all-logs-btn" onClick={() => navigate("/app/logs")}>View All Logs</button>
      </div>

      <s-box className="activity-container">
        {recentLogs.length === 0 ? (
          <div className="empty-state">
            <p className="empty-title">No actions run yet</p>
            <p className="empty-desc">Your product and variant sync logs will appear here once you perform your first bulk import or export.</p>
          </div>
        ) : (
          <div className="activity-table-wrapper">
            <table className="activity-table">
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>Action</th>
                  <th>Status</th>
                  <th>Action ID</th>
                </tr>
              </thead>
              <tbody>
                {recentLogs.map((log) => (
                  <tr key={log.id}>
                    <td className="timestamp-cell">
                      {new Date(log.createdAt).toLocaleString()}
                    </td>
                    <td className="action-cell">
                      <strong>{log.action.replace("_", " ")}</strong>
                    </td>
                    <td>
                      <span className={`status-pill ${log.status.toLowerCase()}`}>
                        {log.status}
                      </span>
                    </td>
                    <td className="id-cell">{log.id.slice(0, 8)}...</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </s-box>
    </s-page>
  );
}
