export const LOCAL_CUSTOM_ORDER_KEY = "catalogue-local-custom-order";

export const readLocalOrder = () => {
  try {
    const value = JSON.parse(window.localStorage.getItem(LOCAL_CUSTOM_ORDER_KEY) || "[]");
    return Array.isArray(value) ? [...new Set(value.filter((id) => typeof id === "string"))] : [];
  } catch {
    return [];
  }
};

export const applyLocalOrder = (links, ids) => {
  const available = new Map(links.map((link) => [link.id, link]));
  const ordered = [];
  for (const id of ids) {
    if (available.has(id)) {
      ordered.push(available.get(id));
      available.delete(id);
    }
  }
  return [...ordered, ...available.values()];
};

export const sortLinks = (links, sortMode) => {
  const sorted = [...links];
  const alphabetically = (a, b) => a.title.localeCompare(b.title, "cs");
  if (sortMode === "clicks") {
    sorted.sort((a, b) => b.clicks - a.clicks || alphabetically(a, b));
  } else if (sortMode === "latest") {
    sorted.sort((a, b) => new Date(b.created_at) - new Date(a.created_at) || alphabetically(a, b));
  } else if (sortMode === "custom") {
    return sorted.sort((a, b) => a.custom_order - b.custom_order || alphabetically(a, b));
  } else {
    sorted.sort(alphabetically);
  }
  return [...sorted.filter((link) => link.is_favorite), ...sorted.filter((link) => !link.is_favorite)];
};
