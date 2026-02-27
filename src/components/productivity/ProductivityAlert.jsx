import { Alert, AlertDescription, AlertTitle } from '../ui/alert';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { AlertTriangle, CheckCircle, Info } from 'lucide-react';

/**
 * アラートアイコンを取得
 */
const getAlertIcon = (type) => {
  switch (type) {
    case 'warning':
      return AlertTriangle;
    case 'success':
      return CheckCircle;
    case 'info':
    default:
      return Info;
  }
};

/**
 * アラートバリアントを取得
 */
const getAlertVariant = (type) => {
  switch (type) {
    case 'warning':
      return 'destructive';
    case 'success':
      return 'default';
    case 'info':
    default:
      return 'default';
  }
};

/**
 * 単一アラートコンポーネント
 */
const AlertItem = ({ alert }) => {
  const Icon = getAlertIcon(alert.type);
  const variant = getAlertVariant(alert.type);

  return (
    <Alert variant={variant}>
      <Icon className="h-4 w-4" />
      <AlertTitle>
        {alert.storeName} - {alert.date} {alert.time}
      </AlertTitle>
      <AlertDescription>{alert.message}</AlertDescription>
    </Alert>
  );
};

/**
 * アラート表示コンポーネント
 * @param {Object} props
 * @param {Array} props.alerts - アラート配列
 * @param {number} props.maxDisplay - 最大表示件数
 */
export const ProductivityAlert = ({ alerts, maxDisplay = 5 }) => {
  if (!alerts || alerts.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>アラート</CardTitle>
        </CardHeader>
        <CardContent>
          <Alert>
            <CheckCircle className="h-4 w-4" />
            <AlertTitle>問題なし</AlertTitle>
            <AlertDescription>
              現在、人時生産性に関するアラートはありません。
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  const displayAlerts = alerts.slice(0, maxDisplay);
  const remainingCount = alerts.length - maxDisplay;

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          アラート
          {alerts.length > 0 && (
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              ({alerts.length}件)
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {displayAlerts.map((alert, idx) => (
            <AlertItem key={idx} alert={alert} />
          ))}
          
          {remainingCount > 0 && (
            <div className="text-sm text-muted-foreground text-center pt-2">
              他 {remainingCount}件のアラートがあります
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

/**
 * アラートサマリーバッジ
 * @param {Object} props
 * @param {Array} props.alerts - アラート配列
 */
export const ProductivityAlertBadge = ({ alerts }) => {
  if (!alerts || alerts.length === 0) {
    return null;
  }

  const warningCount = alerts.filter(a => a.type === 'warning').length;

  if (warningCount === 0) {
    return null;
  }

  return (
    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-destructive/10 text-destructive text-sm font-medium">
      <AlertTriangle className="h-4 w-4" />
      <span>{warningCount}件の警告</span>
    </div>
  );
};
