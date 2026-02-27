/**
 * 店舗設定で保存された並び順に基づいて店舗をソートする
 * DBのsort_orderカラムを優先し、未設定の場合はlocalStorageをフォールバックとして使用
 * @param {Array} stores - 店舗の配列
 * @returns {Array} - ソートされた店舗の配列
 */
export function sortStoresByOrder(stores) {
  if (!stores || stores.length === 0) return [];

  try {
    // DBのsort_orderカラムが設定されている場合はそれを使用
    // sort_order=0も有効な値として扱う（最初の店舗）
    const hasDbOrder = stores.some(s => s.sort_order != null);
    if (hasDbOrder) {
      return [...stores].sort((a, b) => {
        const orderA = a.sort_order ?? 9999;
        const orderB = b.sort_order ?? 9999;
        return orderA - orderB;
      });
    }

    // フォールバック: localStorageの並び順を使用
    const savedOrder = localStorage.getItem('storeOrder');
    if (!savedOrder) return stores;

    const orderArray = JSON.parse(savedOrder);
    if (!Array.isArray(orderArray) || orderArray.length === 0) return stores;

    const orderMap = new Map();
    orderArray.forEach((id, index) => {
      orderMap.set(id, index);
    });

    return [...stores].sort((a, b) => {
      const orderA = orderMap.has(a.id) ? orderMap.get(a.id) : 9999;
      const orderB = orderMap.has(b.id) ? orderMap.get(b.id) : 9999;
      return orderA - orderB;
    });
  } catch (e) {
    console.error('Failed to sort stores by order:', e);
    return stores;
  }
}
