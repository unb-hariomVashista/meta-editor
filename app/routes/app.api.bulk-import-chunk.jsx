import { authenticate } from "../shopify.server.js";
import prisma from "../db.server.js";

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const action = async ({ request }) => {
  try {
    const { admin, session } = await authenticate.admin(request);
    const body = await request.json();
    const { metafields = [], type = "products", isFinal = false, totalImported = 0, totalErrors = 0 } = body;

    const chunks = [];
    for (let i = 0; i < metafields.length; i += 25) {
      chunks.push(metafields.slice(i, i + 25));
    }

    let successCount = 0;
    const errors = [];

    for (const chunk of chunks) {
      let retries = 4;
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
          if (throttleStatus) {
            const available = throttleStatus.currentlyAvailable;
            const restoreRate = throttleStatus.restoreRate || 50;
            if (available < 75) {
              const needed = 120 - available;
              const waitMs = Math.min(Math.max(Math.ceil((needed / restoreRate) * 1000), 500), 4000);
              await wait(waitMs);
            }
          }

          if (json.errors && json.errors.length > 0) {
            const isThrottled = json.errors.some(
              (e) =>
                e.message?.toLowerCase().includes("throttled") ||
                e.extensions?.code === "THROTTLED" ||
                e.extensions?.code === "MAX_COST_EXCEEDED"
            );
            if (isThrottled) {
              retries--;
              await wait(2000 * (5 - retries));
              continue;
            }
            errors.push(...json.errors.map((e) => e.message));
            break;
          }

          const userErrors = json.data?.metafieldsSet?.userErrors || [];
          if (userErrors.length > 0) {
            errors.push(...userErrors.map((e) => e.message));
          } else {
            successCount += chunk.length;
          }
          success = true;
        } catch (err) {
          const msg = err.message?.toLowerCase() || "";
          const isThrottled =
            msg.includes("throttled") ||
            msg.includes("rate limit") ||
            err.status === 429 ||
            err.statusCode === 429 ||
            err.response?.status === 429;

          if (isThrottled && retries > 0) {
            retries--;
            await wait(2500 * (5 - retries));
          } else if (retries > 1 && (err.status >= 500 || msg.includes("fetch failed") || msg.includes("timeout"))) {
            retries--;
            await wait(2000);
          } else {
            console.error("GraphQL request failed:", err);
            errors.push(err.message || "An unexpected error occurred during a chunk import.");
            break;
          }
        }
      }
    }

    if (isFinal) {
      try {
        const finalSuccess = successCount + totalImported;
        const finalErrorsCount = errors.length + totalErrors;
        await prisma.actionLog.create({
          data: {
            shop: session.shop,
            action: type === "products" ? "PRODUCT_IMPORT" : "VARIANT_IMPORT",
            status: finalErrorsCount === 0 ? "SUCCESS" : finalSuccess === 0 ? "ERROR" : "PARTIAL",
            details: JSON.stringify({
              successCount: finalSuccess,
              errorCount: finalErrorsCount,
              sampleErrors: errors.slice(0, 50),
            }),
          },
        });
      } catch (err) {
        console.error("Failed to log import action:", err);
      }
    }

    return new Response(JSON.stringify({ successCount, errors }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Fatal error in bulk-import-chunk action:", err);
    return new Response(JSON.stringify({ error: err.message || "Server error during chunk import" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};

