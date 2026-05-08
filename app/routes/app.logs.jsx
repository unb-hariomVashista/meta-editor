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
    <div>
      <s-section>
        <div style={{ marginBottom: "20px" }}>
          <h2>Action Logs</h2>
          <p>View the history of your imports and exports.</p>
        </div>
        
        <s-table>
          <s-table-header-row>
            <s-table-header>Date</s-table-header>
            <s-table-header>Action</s-table-header>
            <s-table-header>Status</s-table-header>
            <s-table-header>Details</s-table-header>
          </s-table-header-row>
          <s-table-body>
            {logs.length === 0 ? (
              <s-table-row>
                <s-table-cell colSpan={4}>No logs found.</s-table-cell>
              </s-table-row>
            ) : (
              logs.map((log) => (
                <s-table-row key={log.id}>
                  <s-table-cell>{new Date(log.createdAt).toLocaleString()}</s-table-cell>
                  <s-table-cell>
                    <strong>{log.action.replace("_", " ")}</strong>
                  </s-table-cell>
                  <s-table-cell>
                    <span style={{
                      padding: "4px 8px", 
                      borderRadius: "4px", 
                      background: log.status === "SUCCESS" ? "#f3fcf8" : log.status === "ERROR" ? "#fff4f4" : "#fff8e1",
                      color: log.status === "SUCCESS" ? "#008060" : log.status === "ERROR" ? "#d22d2d" : "#916a00",
                      fontWeight: "bold",
                      fontSize: "12px"
                    }}>
                      {log.status}
                    </span>
                  </s-table-cell>
                  <s-table-cell>
                    <button 
                      onClick={() => handleDownload(log.id, log.action)}
                      style={{ 
                        padding: "6px 12px", 
                        cursor: "pointer", 
                        borderRadius: "4px", 
                        border: "1px solid #ccc",
                        background: "#fff",
                        fontSize: "13px"
                      }}
                    >
                      Download JSON Log
                    </button>
                  </s-table-cell>
                </s-table-row>
              ))
            )}
          </s-table-body>
        </s-table>
      </s-section>
    </div>
  );
}
