import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { useState } from 'react';

/**
 * 人時生産性のバッジ色を取得
 */
const getProductivityBadge = (productivity) => {
  const value = parseFloat(productivity) || 0;
  
  if (value >= 3000) {
    return { variant: 'default', className: 'bg-green-600' };
  } else if (value >= 2000) {
    return { variant: 'secondary', className: '' };
  } else {
    return { variant: 'destructive', className: '' };
  }
};

/**
 * タイムライン行コンポーネント
 */
const TimelineRow = ({ item, onToggleDetail }) => {
  const [showDetail, setShowDetail] = useState(false);

  const handleToggle = () => {
    setShowDetail(!showDetail);
    if (onToggleDetail) {
      onToggleDetail(item, !showDetail);
    }
  };

  const productivityBadge = getProductivityBadge(item.spd);

  return (
    <>
      <TableRow className="cursor-pointer hover:bg-muted/50" onClick={handleToggle}>
        <TableCell>
          <div className="flex items-center gap-2">
            {item.detail && item.detail.length > 0 && (
              showDetail ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />
            )}
            <span className="font-medium">{item.tenpo_name}</span>
          </div>
        </TableCell>
        <TableCell>{item.wk_date}</TableCell>
        <TableCell>{item.dayweek}</TableCell>
        <TableCell className="text-right font-medium">
          ¥{parseFloat(item.kingaku || 0).toLocaleString()}
        </TableCell>
        <TableCell className="text-center">{item.wk_cnt}人</TableCell>
        <TableCell className="text-right">{item.wk_tm}h</TableCell>
        <TableCell className="text-right">
          <Badge {...productivityBadge}>
            ¥{parseFloat(item.spd || 0).toLocaleString()}
          </Badge>
        </TableCell>
      </TableRow>
      
      {showDetail && item.detail && item.detail.length > 0 && (
        <TableRow>
          <TableCell colSpan={7} className="bg-muted/30 p-0">
            <div className="p-4">
              <h4 className="text-sm font-semibold mb-2">時間帯別詳細</h4>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>時刻</TableHead>
                    <TableHead className="text-right">売上</TableHead>
                    <TableHead className="text-center">勤務人数</TableHead>
                    <TableHead className="text-right">勤務時間</TableHead>
                    <TableHead className="text-right">人時生産性</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {item.detail.map((detail, idx) => {
                    const detailBadge = getProductivityBadge(detail.sph);
                    return (
                      <TableRow key={idx}>
                        <TableCell className="font-medium">{detail.tm}</TableCell>
                        <TableCell className="text-right">
                          ¥{parseFloat(detail.kingaku || 0).toLocaleString()}
                        </TableCell>
                        <TableCell className="text-center">{detail.wk_cnt}人</TableCell>
                        <TableCell className="text-right">{detail.wk_tm}h</TableCell>
                        <TableCell className="text-right">
                          <Badge {...detailBadge} className="text-xs">
                            ¥{parseFloat(detail.sph || 0).toLocaleString()}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  );
};

/**
 * タイムライン表示コンポーネント
 * @param {Object} props
 * @param {Array} props.data - 人事生産性データ
 * @param {boolean} props.loading - ローディング状態
 */
export const ProductivityTimeline = ({ data, loading }) => {
  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>タイムライン</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center h-64">
            <div className="text-muted-foreground">データを読み込み中...</div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!data || data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>タイムライン</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center h-64">
            <div className="text-muted-foreground">データがありません</div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>タイムライン</CardTitle>
        <p className="text-sm text-muted-foreground">
          行をクリックすると時間帯別の詳細が表示されます
        </p>
      </CardHeader>
      <CardContent>
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>店舗名</TableHead>
                <TableHead>日付</TableHead>
                <TableHead>曜日</TableHead>
                <TableHead className="text-right">売上</TableHead>
                <TableHead className="text-center">勤務人数</TableHead>
                <TableHead className="text-right">勤務時間</TableHead>
                <TableHead className="text-right">人時生産性</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((item, idx) => (
                <TimelineRow key={idx} item={item} />
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
};
