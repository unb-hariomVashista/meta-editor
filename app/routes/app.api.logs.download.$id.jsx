import { authenticate } from "../shopify.server.js";
import prisma from "../db.server.js";

export const loader = async ({ request, params }) => {
  const { session } = await authenticate.admin(request);
  const id = params.id;

  const log = await prisma.actionLog.findUnique({
    where: { id }
  });

  if (!log || log.shop !== session.shop) {
    return new Response("Not found or unauthorized", { status: 404 });
  }

  return new Response(log.details || "{}", {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="log-${log.action}-${log.id}.json"`,
    },
  });
};
