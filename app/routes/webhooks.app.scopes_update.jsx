import { authenticate } from "../shopify.server";
import db from "../db.server";

export const action = async ({ request }) => {
  try {
    const { payload, session, topic, shop } = await authenticate.webhook(request);

    console.log(`Received ${topic} webhook for ${shop}`);

    if (session && payload && payload.current) {
      await db.session.update({
        where: {
          id: session.id,
        },
        data: {
          scope: payload.current.toString(),
        },
      });
    }

    return new Response("OK", { status: 200 });
  } catch (error) {
    console.error("Error in scopes_update webhook handler:", error);
    if (error instanceof Response) {
      return error;
    }
    return new Response("Internal Server Error", { status: 500 });
  }
};
