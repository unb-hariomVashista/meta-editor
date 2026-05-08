import { authenticate } from "../shopify.server.js";
import prisma from "../db.server.js";

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const action = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const body = await request.json();
  const { metafields, type, isFinal, totalImported, totalErrors } = body;

  const chunks = [];
  for (let i = 0; i < metafields.length; i += 25) {
    chunks.push(metafields.slice(i, i + 25));
  }

  let successCount = 0;
  let errors = [];

  for (const chunk of chunks) {
    let retries = 3;
    let success = false;

    while (retries > 0 && !success) {
      try {
        const response = await admin.graphql(
          `
            mutation MetafieldsSet($metafields: [MetafieldsSetInput!]!) {
              metafieldsSet(metafields: $metafields) {
                metafields { id }
                userErrors { field message }
              }
            }
          `,
          { variables: { metafields: chunk } }
        );

        const json = await response.json();
        const throttleStatus = json.extensions?.cost?.throttleStatus;
        if (throttleStatus && throttleStatus.currentlyAvailable < 150) {
          await wait(2000);
        }

        if (json.errors) {
          const isThrottled = json.errors.some(e => e.message?.toLowerCase().includes('throttled'));
          if (isThrottled) {
            retries--;
            await wait(3000);
            continue;
          }
          errors.push(...json.errors.map(e => e.message));
          break; 
        }

        const userErrors = json.data?.metafieldsSet?.userErrors || [];
        if (userErrors.length > 0) {
          errors.push(...userErrors.map(e => e.message));
        } else {
          successCount += chunk.length;
        }
        success = true;
      } catch (err) {
        if (err.message && err.message.toLowerCase().includes('throttled')) {
          retries--;
          await wait(3000);
        } else {
          console.error("GraphQL request failed:", err);
          errors.push("An unexpected error occurred during a chunk import.");
          break;
        }
      }
    }
  }

  if (isFinal) {
    try {
      await prisma.actionLog.create({
        data: {
          shop: session.shop,
          action: type === "products" ? "PRODUCT_IMPORT" : "VARIANT_IMPORT",
          status: (errors.length + totalErrors) === 0 ? "SUCCESS" : ((successCount + totalImported) === 0 ? "ERROR" : "PARTIAL"),
          details: JSON.stringify({ successCount: successCount + totalImported, errors: [...errors] })
        }
      });
    } catch (err) {
      console.error("Failed to log import action:", err);
    }
  }

  return new Response(JSON.stringify({ successCount, errors }), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
};
