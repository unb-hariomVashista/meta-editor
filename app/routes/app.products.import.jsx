import { useState, useRef } from "react";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }) => {
  await authenticate.admin(request);
  return null;
};

export default function ProductImport() {
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
      
      const gidIdx = headers.findIndex(h => h === "product gid" || (h.includes("gid") && !h.includes("variant")));
      const nsIdx = headers.findIndex(h => h.includes("namespace") || h.includes("names"));
      const keyIdx = headers.findIndex(h => h.includes("key"));
      const typeIdx = headers.findIndex(h => h.includes("type"));
      const valIdx = headers.findIndex(h => h.includes("value"));

      if (gidIdx === -1 || nsIdx === -1 || keyIdx === -1 || typeIdx === -1 || valIdx === -1) {
        throw new Error("CSV is missing required headers (product gid, metafield namespace, key, type, value).");
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

        if (!gid.startsWith("gid://shopify/Product/")) {
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
        if (invalidTypeRows > 0) msg += ` ${invalidTypeRows} rows were skipped because they contained Variant GIDs instead of Product GIDs.`;
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
            type: "products",
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

      setSuccessMsg(`Successfully imported ${totalImported} product metafields.`);
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
    <div className="page-section-container">
      <div className="import-wrapper-grid">
        {/* CSV Format Guide */}
        <div className="import-guide-card">
          <h3>CSV Structure Requirements</h3>
          <p>Please ensure your CSV file has the exact headers shown below. Incorrect headers or structures will fail validation.</p>
          <div className="csv-header-display">
            <code>product gid, product handle, product title, metafield names, metafield key, metafield type, metafield value</code>
          </div>
          
          <div className="guide-points">
            <div className="guide-point-item">
              <span className="badge-bullet">1</span>
              <span><strong>product gid</strong> must start with <code>gid://shopify/Product/...</code></span>
            </div>
            <div className="guide-point-item">
              <span className="badge-bullet">2</span>
              <span><strong>metafield type</strong> must match valid Shopify types (e.g. <code>single_line_text_field</code>, <code>json</code>, etc.)</span>
            </div>
          </div>
        </div>

        {/* Upload Form Card */}
        <div className="import-upload-card">
          <h3>Upload Data Sheet</h3>
          <p className="subtitle">Choose your prepared CSV file to start the bulk sync</p>

          {errorMsg && (
            <div className="alert alert-error">
              <strong>Import Error:</strong> {errorMsg}
            </div>
          )}

          {successMsg && (
            <div className="alert alert-success">
              <strong>Import Success:</strong> {successMsg}
              {importErrors.length > 0 && (
                <div className="import-warnings">
                  <strong>Sync Warnings:</strong>
                  <ul>
                    {importErrors.map((err, i) => <li key={i}>{err}</li>)}
                  </ul>
                </div>
              )}
            </div>
          )}

          <form onSubmit={handleImport} className="upload-form">
            <div className="file-uploader-box">
              <input 
                type="file" 
                name="file" 
                accept=".csv" 
                required
                ref={fileInputRef}
                id="csv-file-input"
                onChange={(e) => setFileSelected(e.target.files.length > 0)}
                className="file-input-hidden"
              />
              <label htmlFor="csv-file-input" className={`file-upload-label ${fileSelected ? 'has-file' : ''}`}>
                <div className="upload-icon">📥</div>
                <div className="upload-text">
                  {fileSelected ? (
                    <strong>{fileInputRef.current?.files[0]?.name}</strong>
                  ) : (
                    <span>Click to browse or drop your CSV file here</span>
                  )}
                </div>
                <div className="upload-subtext">Supports only .csv spreadsheets</div>
              </label>
            </div>

            {progress && (
              <div className="progress-bar-container">
                <div className="progress-text-row">
                  <span>Syncing metafield data...</span>
                  <strong>{progress.current} / {progress.total}</strong>
                </div>
                <div className="progress-track">
                  <div 
                    className="progress-fill" 
                    style={{ width: `${Math.round((progress.current / progress.total) * 100)}%` }}
                  ></div>
                </div>
              </div>
            )}

            <button 
              type="submit" 
              disabled={!fileSelected || isSubmitting}
              className="btn btn-primary btn-block"
            >
              {isSubmitting ? "Syncing Bulk Data..." : "Upload & Run Sync"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
