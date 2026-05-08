import { useState, useRef } from "react";

export default function VariantImport() {
  const [fileSelected, setFileSelected] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [progress, setProgress] = useState(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [importErrors, setImportErrors] = useState([]);
  const fileInputRef = useRef(null);

  const parseLine = (line) => {
    const matches = line.match(/(?:^|,)(?:"([^"]*(?:""[^"]*)*)"|([^",]*))/g);
    if (!matches) return [];
    return matches.map(m => {
      let val = m;
      if (val[0] === ',') val = val.substring(1);
      if (val[0] === '"' && val[val.length - 1] === '"') {
        val = val.substring(1, val.length - 1).replace(/""/g, '"');
      }
      return val;
    });
  };

  const handleImport = async (e) => {
    e.preventDefault();
    setErrorMsg("");
    setSuccessMsg("");
    setImportErrors([]);
    setIsSubmitting(true);
    setProgress(null);

    const file = fileInputRef.current?.files[0];
    if (!file) {
      setErrorMsg("Please select a valid CSV file.");
      setIsSubmitting(false);
      return;
    }

    try {
      const text = await file.text();
      const lines = text.trim().split('\n');
      if (lines.length < 2) {
        throw new Error("CSV file is empty or missing data rows.");
      }

      const headers = parseLine(lines[0]).map(h => h.trim().toLowerCase());
      
      const gidIdx = headers.findIndex(h => h === "variant gid" || (h.includes("gid") && !h.includes("product")));
      const nsIdx = headers.findIndex(h => h.includes("namespace") || h.includes("names"));
      const keyIdx = headers.findIndex(h => h.includes("key"));
      const typeIdx = headers.findIndex(h => h.includes("type"));
      const valIdx = headers.findIndex(h => h.includes("value"));

      if (gidIdx === -1 || nsIdx === -1 || keyIdx === -1 || typeIdx === -1 || valIdx === -1) {
        throw new Error("CSV is missing required headers (variant gid, metafield namespace, key, type, value).");
      }

      const metafields = [];
      let skippedEmptyRows = 0;
      let invalidTypeRows = 0;

      for (let i = 1; i < lines.length; i++) {
        const row = parseLine(lines[i]);
        if (row.length < headers.length) continue;

        const gid = row[gidIdx]?.trim();
        const namespace = row[nsIdx]?.trim();
        const key = row[keyIdx]?.trim();
        const type = row[typeIdx]?.trim();
        const value = row[valIdx]?.trim();

        if (!gid && !namespace && !key) continue; // Purely empty row

        if (!gid || !namespace || !key || !type) {
          skippedEmptyRows++;
          continue;
        }

        if (!gid.startsWith("gid://shopify/ProductVariant/")) {
          invalidTypeRows++;
          continue;
        }

        metafields.push({
          ownerId: gid,
          namespace,
          key,
          type,
          value
        });
      }

      if (metafields.length === 0) {
        let msg = "No valid metafields found to import.";
        if (invalidTypeRows > 0) msg += ` ${invalidTypeRows} rows were skipped because they contained Product GIDs instead of Variant GIDs.`;
        throw new Error(msg);
      }

      const CHUNK_SIZE = 500;
      let totalImported = 0;
      let accumulatedErrors = [];

      setProgress({ current: 0, total: metafields.length });
      const token = await window.shopify.idToken();

      for (let i = 0; i < metafields.length; i += CHUNK_SIZE) {
        const batch = metafields.slice(i, i + CHUNK_SIZE);
        const isFinal = (i + CHUNK_SIZE) >= metafields.length;

        const res = await fetch("/app/api/bulk-import-chunk", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`
          },
          body: JSON.stringify({
            metafields: batch,
            type: "variants",
            isFinal,
            totalImported,
            totalErrors: accumulatedErrors.length
          })
        });

        if (!res.ok) {
           throw new Error("Server error during import chunk processing.");
        }

        const data = await res.json();
        totalImported += data.successCount || 0;
        if (data.errors && data.errors.length > 0) {
          accumulatedErrors.push(...data.errors);
        }

        setProgress({ current: Math.min(i + CHUNK_SIZE, metafields.length), total: metafields.length });
      }

      setSuccessMsg(`Successfully imported ${totalImported} variant metafields.`);
      if (accumulatedErrors.length > 0) {
        setImportErrors(accumulatedErrors);
      }
    } catch (err) {
      console.error(err);
      setErrorMsg(err.message || "An unexpected error occurred during processing.");
    }

    setIsSubmitting(false);
  };

  return (
    <div>
      <s-section>
        <div style={{ marginBottom: "20px" }}>
          <h2 style={{ fontSize: "1.5rem", marginBottom: "10px" }}>Import Variant Metafields</h2>
          <p>Upload a CSV file containing the following headers:</p>
          <code style={{ display: "block", padding: "10px", background: "#f4f6f8", margin: "10px 0", borderRadius: "4px" }}>
            variant gid, variant title, product handle, product title, metafield namespace, metafield key, metafield type, metafield value
          </code>
        </div>
        
        {errorMsg && (
          <div style={{ color: "#d22d2d", backgroundColor: "#fff4f4", marginBottom: "15px", padding: "10px", border: "1px solid #d22d2d", borderRadius: "4px" }}>
            <strong>Error: </strong> {errorMsg}
          </div>
        )}

        {successMsg && (
          <div style={{ color: "#008060", backgroundColor: "#f3fcf8", marginBottom: "15px", padding: "10px", border: "1px solid #008060", borderRadius: "4px" }}>
            <strong>Success: </strong> {successMsg}
            {importErrors.length > 0 && (
              <div style={{ color: "#d22d2d", marginTop: "10px" }}>
                <strong>Warnings/Errors during import:</strong>
                <ul style={{ marginTop: "5px", marginLeft: "20px", maxHeight: "150px", overflowY: "auto" }}>
                  {importErrors.map((err, i) => <li key={i}>{err}</li>)}
                </ul>
              </div>
            )}
          </div>
        )}

        <form onSubmit={handleImport}>
          <div style={{ marginBottom: "15px" }}>
            <input 
              type="file" 
              name="file" 
              accept=".csv" 
              required
              ref={fileInputRef}
              onChange={(e) => setFileSelected(e.target.files.length > 0)}
              style={{ display: "block", padding: "10px 0" }}
            />
          </div>
          
          {progress && (
            <div style={{ marginBottom: "15px" }}>
              <div style={{ fontSize: "13px", marginBottom: "5px", color: "#5c5f62" }}>
                Importing: {progress.current} / {progress.total} metafields
              </div>
              <div style={{ width: "100%", height: "8px", backgroundColor: "#e4e5e7", borderRadius: "4px", overflow: "hidden" }}>
                <div style={{ width: `${Math.round((progress.current / progress.total) * 100)}%`, height: "100%", backgroundColor: "#008060", transition: "width 0.3s ease" }}></div>
              </div>
            </div>
          )}

          <button 
            type="submit" 
            disabled={!fileSelected || isSubmitting}
            style={{ 
              padding: "8px 16px", 
              backgroundColor: (!fileSelected || isSubmitting) ? "#e4e5e7" : "#000",
              color: (!fileSelected || isSubmitting) ? "#8c9196" : "#fff",
              border: "none",
              borderRadius: "4px",
              cursor: (!fileSelected || isSubmitting) ? "not-allowed" : "pointer",
              fontWeight: "bold"
            }}
          >
            {isSubmitting ? "Importing..." : "Upload & Import"}
          </button>
        </form>
      </s-section>
    </div>
  );
}
