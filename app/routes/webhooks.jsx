import { authenticate } from "../shopify.server";

export const loader = async () => {
  return new Response("Method Not Allowed", { status: 405 });
};

export const action = async ({ request }) => {
  try {
    const { topic, shop, payload } = await authenticate.webhook(request);

    console.log(`Received compliance webhook: ${topic} for ${shop}`);

    const cleanTopic = (topic || "").toUpperCase();

    switch (cleanTopic) {
      case "CUSTOMERS_DATA_REQUEST":
      case "CUSTOMERS/DATA_REQUEST":
        // Handle customer data request
        console.log("Processing customers/data_request:", payload);
        break;
      case "CUSTOMERS_REDACT":
      case "CUSTOMERS/REDACT":
        // Handle customer data redaction
        console.log("Processing customers/redact:", payload);
        break;
      case "SHOP_REDACT":
      case "SHOP/REDACT":
        // Handle shop data redaction
        console.log("Processing shop/redact:", payload);
        break;
      default:
        console.warn(`Unexpected topic received: ${topic}`);
        return new Response("Unhandled webhook topic", { status: 200 });
    }

    return new Response("OK", { status: 200 });
  } catch (error) {
    console.error("Error in compliance webhook action:", error);
    if (error instanceof Response) {
      return error;
    }
    return new Response(error?.message || "Internal Server Error", { status: 500 });
  }
};
