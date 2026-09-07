export const fetchMetafieldDefinitions = async (admin, ownerType) => {
  let hasNextPage = true;
  let cursor = null;
  const definitions = [];

  while (hasNextPage) {
    const response = await admin.graphql(
      `
        query GetMetafieldDefinitions($ownerType: MetafieldOwnerType!, $cursor: String) {
          metafieldDefinitions(ownerType: $ownerType, first: 250, after: $cursor) {
            edges {
              cursor
              node {
                namespace
                key
                type {
                  name
                }
              }
            }
            pageInfo {
              hasNextPage
              endCursor
            }
          }
        }
      `,
      {
        variables: {
          ownerType,
          cursor,
        },
      }
    );

    const json = await response.json();
    const connection = json.data?.metafieldDefinitions;
    if (!connection) break;

    definitions.push(
      ...connection.edges.map((e) => ({
        namespace: e.node.namespace,
        key: e.node.key,
        type: e.node.type?.name || "",
      }))
    );
    hasNextPage = connection.pageInfo.hasNextPage;
    cursor = connection.pageInfo.endCursor;
  }

  return definitions;
};

export const mergeMetafields = (definitions, existingMetafields = []) => {
  const existingMap = new Map();
  existingMetafields.forEach((m) => {
    if (m && m.namespace && m.key) {
      existingMap.set(`${m.namespace}.${m.key}`, m);
    }
  });

  const result = [];

  definitions.forEach((def) => {
    const key = `${def.namespace}.${def.key}`;
    const existing = existingMap.get(key);
    result.push({
      namespace: def.namespace,
      key: def.key,
      type: existing?.type || def.type,
      value: existing?.value ?? "",
    });
  });

  return result;
};
