import { useLoaderData } from "react-router";
import { authenticate } from "../shopify.server.js";
import prisma from "../db.server.js";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);

  const logs = await prisma.actionLog.findMany({
    where: { shop: session.shop },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return { logs };
};

export default function Logs() {
  const { logs } = useLoaderData();

  const handleDownload = async (id, actionType) => {
    try {
      const token = await window.shopify.idToken();
      const response = await fetch(`/app/api/logs/download/${id}`, {
        headers: {
          "Authorization": `Bearer ${token}`
        }
      });
      if (!response.ok) throw new Error("Failed to download");
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `log-${actionType}-${id}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (e) {
      alert("Failed to download log.");
    }
  };

  return (
    <div className="page-section-container">
      <div className="dashboard-section-header">
        <h2>Action Logs</h2>
        <p>View the history of your imports and exports.</p>
      </div>

      <div className="table-card">
        <table className="data-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Action</th>
              <th>Status</th>
              <th>Details</th>
            </tr>
          </thead>
          <tbody>
            {logs.length === 0 ? (
              <tr>
                <td colSpan={4} style={{ textAlign: "center", padding: "40px" }}>
                  <p style={{ color: "#6d7175", margin: 0 }}>No logs found.</p>
                </td>
              </tr>
            ) : (
              logs.map((log) => (
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
                  <td>
                    <button 
                      onClick={() => handleDownload(log.id, log.action)}
                      className="btn-download"
                    >
                      Download JSON Log
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
