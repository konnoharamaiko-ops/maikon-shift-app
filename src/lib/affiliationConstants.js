/**
 * 所属先選択肢の共通定数
 * アプリ全体で統一して使用する
 * 構成: 店1018・通企総0919・工房0918・駅催事出張
 */

export const AFFILIATION_GROUPS = [
  {
    label: '店1018',
    options: [
      '田辺店',
      '北摂店',
      '美和堂福島店',
      '堺東店',
      'イオン松原店',
      'イオン守口店',
      '天王寺店',
      'かがや店',
      '心斎橋店',
      '大正店',
      '天下茶屋店',
      'アベノ店',
      '駅丸',
    ],
  },
  {
    label: '通企総0919',
    options: ['特販部', '通販部', '企画部'],
  },
  {
    label: '工房0918',
    options: ['北摂工場', 'かがや工場', '南田辺工房'],
  },
  {
    label: '駅催事出張',
    options: ['駅催事出張'],
  },
];

/** 全所属先のフラットな配列 */
export const ALL_AFFILIATIONS = AFFILIATION_GROUPS.flatMap(g => g.options);

/**
 * JSX用: <optgroup>/<option>を生成するためのヘルパー
 * 使用例:
 *   <select>
 *     <option value="">選択してください</option>
 *     {renderAffiliationOptions()}
 *   </select>
 */
export function renderAffiliationOptions() {
  return AFFILIATION_GROUPS.map(group => (
    <optgroup key={group.label} label={group.label}>
      {group.options.map(opt => (
        <option key={opt} value={opt}>{opt}</option>
      ))}
    </optgroup>
  ));
}
