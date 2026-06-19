import { authenticate } from "../shopify.server";

export const action = async ({ request }) => {
  const { topic, shop, payload } = await authenticate.webhook(request);

  console.log(`Received compliance webhook: ${topic} for ${shop}`);

  switch (topic) {
    case "CUSTOMERS_DATA_REQUEST":
    case "customers/data_request":
      // Handle customer data request
      console.log("Processing customers/data_request:", payload);
      break;
    case "CUSTOMERS_REDACT":
    case "customers/redact":
      // Handle customer data redaction
      console.log("Processing customers/redact:", payload);
      break;
    case "SHOP_REDACT":
    case "shop/redact":
      // Handle shop data redaction
      console.log("Processing shop/redact:", payload);
      break;
    default:
      console.warn(`Unexpected topic received: ${topic}`);
      return new Response("Unhandled webhook topic", { status: 404 });
  }

  return new Response();
};
