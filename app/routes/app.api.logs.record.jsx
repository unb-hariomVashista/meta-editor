import { authenticate } from "../shopify.server.js";
import prisma from "../db.server.js";

export const action = async ({ request }) => {
  try {
    const { session } = await authenticate.admin(request);
    const body = await request.json();
    const { action, status, details } = body;

    if (!action || !status) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const log = await prisma.actionLog.create({
      data: {
        shop: session.shop,
        action,
        status,
        details: typeof details === "string" ? details : JSON.stringify(details || {}),
      },
    });

    return new Response(JSON.stringify({ success: true, logId: log.id }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Error creating action log:", err);
    return new Response(JSON.stringify({ error: err.message || "Failed to create log" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
