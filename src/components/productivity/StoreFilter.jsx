import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Label } from '../ui/label';

/**
 * 店舗フィルターコンポーネント
 * @param {Object} props
 * @param {string} props.value - 選択中の店舗コード
 * @param {Function} props.onChange - 変更時のコールバック
 * @param {Array} props.stores - 店舗リスト
 */
export const StoreFilter = ({ value, onChange, stores = [] }) => {
  // デフォルトの店舗リスト（データから抽出する場合もある）
  const defaultStores = [
    { code: 'all', name: 'すべての店舗' },
    { code: '001', name: '本店' },
    { code: '002', name: '支店A' },
    { code: '003', name: '支店B' },
  ];

  const storeList = stores.length > 0 ? stores : defaultStores;

  return (
    <div className="space-y-2">
      <Label htmlFor="store-filter">店舗</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id="store-filter" className="w-[200px]">
          <SelectValue placeholder="店舗を選択" />
        </SelectTrigger>
        <SelectContent>
          {storeList.map((store) => (
            <SelectItem key={store.code} value={store.code}>
              {store.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
};

/**
 * データから店舗リストを抽出
 * @param {Array} data - 人事生産性データ
 * @returns {Array} 店舗リスト
 */
export const extractStoresFromData = (data) => {
  if (!data || data.length === 0) {
    return [];
  }

  const storeMap = new Map();
  storeMap.set('all', { code: 'all', name: 'すべての店舗' });

  data.forEach((item) => {
    if (item.code && item.tenpo_name && !storeMap.has(item.code)) {
      storeMap.set(item.code, {
        code: item.code,
        name: item.tenpo_name,
      });
    }
  });

  return Array.from(storeMap.values());
};
