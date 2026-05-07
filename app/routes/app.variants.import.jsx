import { Form, useActionData, useNavigation } from "react-router";
import { authenticate } from "../shopify.server.js";
import { useState } from "react";

export const action = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  const formData = await request.formData();
  const file = formData.get("file");

  if (!file || typeof file === "string") {
    return { error: "Please upload a valid CSV file." };
  }

  const csvText = await file.text();
  const lines = csvText.trim().split('\n');
  if (lines.length < 2) {
    return { error: "CSV file is empty or missing data rows." };
  }

  // Simple CSV parser that respects quotes
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

  const headers = parseLine(lines[0]).map(h => h.trim().toLowerCase());
  
  // Find indices based on expected headers (handling both "namespace" and "names")
  const gidIdx = headers.findIndex(h => h.includes("variant gid"));
  const nsIdx = headers.findIndex(h => h.includes("namespace") || h.includes("names"));
  const keyIdx = headers.findIndex(h => h.includes("key"));
  const typeIdx = headers.findIndex(h => h.includes("type"));
  const valIdx = headers.findIndex(h => h.includes("value"));

  if (gidIdx === -1 || nsIdx === -1 || keyIdx === -1 || typeIdx === -1 || valIdx === -1) {
    return { error: "CSV is missing required headers (variant gid, metafield namespace/names, metafield key, metafield type, metafield value)." };
  }

  const metafields = [];
  for (let i = 1; i < lines.length; i++) {
    const row = parseLine(lines[i]);
    if (row.length < headers.length) continue;

    const gid = row[gidIdx].trim();
    const namespace = row[nsIdx].trim();
    const key = row[keyIdx].trim();
    const type = row[typeIdx].trim();
    const value = row[valIdx].trim();

    // Skip empty values
    if (!gid || !namespace || !key || !type) continue;

    metafields.push({
      ownerId: gid,
      namespace,
      key,
      type,
      value
    });
  }

  if (metafields.length === 0) {
    return { error: "No valid metafields found to import." };
  }

  // Batch process metafields (Shopify limits metafieldsSet to 25 items per request)
  const chunks = [];
  for (let i = 0; i < metafields.length; i += 25) {
    chunks.push(metafields.slice(i, i + 25));
  }

  let successCount = 0;
  let errors = [];

  for (const chunk of chunks) {
    const response = await admin.graphql(
      `
        mutation MetafieldsSet($metafields: [MetafieldsSetInput!]!) {
          metafieldsSet(metafields: $metafields) {
            metafields {
              id
            }
            userErrors {
              field
              message
            }
          }
        }
      `,
      {
        variables: { metafields: chunk }
      }
    );

    const json = await response.json();
    const userErrors = json.data?.metafieldsSet?.userErrors || [];
    
    if (userErrors.length > 0) {
      errors.push(...userErrors.map(e => e.message));
    } else {
      successCount += chunk.length;
    }
  }

  return { success: `Successfully imported ${successCount} variant metafields.`, errors };
};

export default function VariantImport() {
  const actionData = useActionData();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  const [fileSelected, setFileSelected] = useState(false);

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
        
        {actionData?.error && (
          <div style={{ color: "#d22d2d", backgroundColor: "#fff4f4", marginBottom: "15px", padding: "10px", border: "1px solid #d22d2d", borderRadius: "4px" }}>
            <strong>Error: </strong> {actionData.error}
          </div>
        )}

        {actionData?.success && (
          <div style={{ color: "#008060", backgroundColor: "#f3fcf8", marginBottom: "15px", padding: "10px", border: "1px solid #008060", borderRadius: "4px" }}>
            <strong>Success: </strong> {actionData.success}
            {actionData.errors?.length > 0 && (
              <div style={{ color: "#d22d2d", marginTop: "10px" }}>
                <strong>Warnings/Errors during import:</strong>
                <ul style={{ marginTop: "5px", marginLeft: "20px" }}>
                  {actionData.errors.map((err, i) => <li key={i}>{err}</li>)}
                </ul>
              </div>
            )}
          </div>
        )}

        <Form method="post" encType="multipart/form-data">
          <div style={{ marginBottom: "15px" }}>
            <input 
              type="file" 
              name="file" 
              accept=".csv" 
              required
              onChange={(e) => setFileSelected(e.target.files.length > 0)}
              style={{ display: "block", padding: "10px 0" }}
            />
          </div>
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
        </Form>
      </s-section>
    </div>
  );
}
