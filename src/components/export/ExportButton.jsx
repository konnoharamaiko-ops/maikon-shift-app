import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Download, FileText, Table } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ja } from 'date-fns/locale';
import jsPDF from 'jspdf';

export default function ExportButton({ 
  data, 
  filename, 
  type = 'shifts',
  disabled = false,
  size = 'default',
  variant = 'outline'
}) {
  const [isExporting, setIsExporting] = useState(false);

  const exportToCSV = () => {
    try {
      setIsExporting(true);
      
      let csvContent = '';
      
      if (type === 'shifts') {
        // シフト希望データ
        csvContent = '\uFEFF'; // UTF-8 BOM for Excel
        csvContent += '日付,ユーザー,店舗,開始時間,終了時間,休み,有給,終日可能,相談可,備考\n';
        
        data.forEach(item => {
          const row = [
            item.date || '',
            item.user_name || item.created_by || '',
            item.store_name || '',
            item.is_day_off ? '休み' : item.start_time?.slice(0, 5) || '',
            item.is_day_off ? '' : item.end_time?.slice(0, 5) || '',
            item.is_day_off ? 'はい' : 'いいえ',
            item.is_paid_leave ? 'はい' : 'いいえ',
            item.is_full_day_available ? 'はい' : 'いいえ',
            item.is_negotiable_if_needed ? 'はい' : 'いいえ',
            (item.notes || '').replace(/,/g, '、').replace(/\n/g, ' ')
          ];
          csvContent += row.join(',') + '\n';
        });
      } else if (type === 'workShifts') {
        // 確定シフトデータ
        csvContent = '\uFEFF';
        csvContent += '日付,ユーザー,店舗,開始時間,終了時間,確定済み,備考\n';
        
        data.forEach(item => {
          const row = [
            item.date || '',
            item.user_name || item.user_email || '',
            item.store_name || '',
            item.start_time?.slice(0, 5) || '',
            item.end_time?.slice(0, 5) || '',
            item.is_confirmed ? 'はい' : 'いいえ',
            (item.notes || '').replace(/,/g, '、').replace(/\n/g, ' ')
          ];
          csvContent += row.join(',') + '\n';
        });
      } else if (type === 'users') {
        // ユーザーデータ
        csvContent = '\uFEFF';
        csvContent += '氏名,メールアドレス,権限,所属店舗,雇用形態,時給,登録日\n';
        
        data.forEach(item => {
          const roleLabel = item.user_role === 'admin' ? '管理者' : 
                           item.user_role === 'manager' ? 'マネージャー' : 'ユーザー';
          const row = [
            item.metadata?.display_name || item.full_name || '',
            item.email || '',
            roleLabel,
            item.store_names?.join('・') || '',
            item.employment_type || '',
            item.hourly_wage || '',
            item.created_date ? format(new Date(item.created_date), 'yyyy/MM/dd', { locale: ja }) : ''
          ];
          csvContent += row.join(',') + '\n';
        });
      }

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', `${filename}_${format(new Date(), 'yyyyMMdd')}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      toast.success('CSVファイルをエクスポートしました');
    } catch (error) {
      console.error('CSV export error:', error);
      toast.error('エクスポートに失敗しました');
    } finally {
      setIsExporting(false);
    }
  };

  const exportToPDF = () => {
    try {
      setIsExporting(true);
      
      const doc = new jsPDF({
        orientation: 'landscape',
        unit: 'mm',
        format: 'a4'
      });

      // タイトル設定
      doc.setFontSize(16);
      doc.text(filename, 15, 15);
      
      doc.setFontSize(10);
      doc.text(`出力日時: ${format(new Date(), 'yyyy年MM月dd日 HH:mm', { locale: ja })}`, 15, 22);

      let yPos = 35;
      const lineHeight = 7;
      const pageHeight = doc.internal.pageSize.height;

      if (type === 'shifts') {
        // シフト希望データ
        doc.setFontSize(9);
        
        // ヘッダー
        doc.text('日付', 15, yPos);
        doc.text('ユーザー', 40, yPos);
        doc.text('店舗', 80, yPos);
        doc.text('開始', 110, yPos);
        doc.text('終了', 130, yPos);
        doc.text('休み', 150, yPos);
        doc.text('備考', 170, yPos);
        
        yPos += lineHeight;
        doc.line(15, yPos - 2, 280, yPos - 2);

        data.forEach((item, index) => {
          if (yPos > pageHeight - 20) {
            doc.addPage();
            yPos = 20;
          }

          doc.text(item.date || '', 15, yPos);
          doc.text((item.user_name || item.created_by || '').substring(0, 15), 40, yPos);
          doc.text((item.store_name || '').substring(0, 10), 80, yPos);
          doc.text(item.is_day_off ? '休み' : item.start_time?.slice(0, 5) || '', 110, yPos);
          doc.text(item.is_day_off ? '' : item.end_time?.slice(0, 5) || '', 130, yPos);
          doc.text(item.is_day_off ? 'O' : '', 150, yPos);
          doc.text((item.notes || '').substring(0, 30), 170, yPos);
          
          yPos += lineHeight;
        });
      } else if (type === 'workShifts') {
        // 確定シフトデータ
        doc.setFontSize(9);
        
        doc.text('日付', 15, yPos);
        doc.text('ユーザー', 40, yPos);
        doc.text('店舗', 80, yPos);
        doc.text('開始時間', 110, yPos);
        doc.text('終了時間', 135, yPos);
        doc.text('確定', 160, yPos);
        doc.text('備考', 180, yPos);
        
        yPos += lineHeight;
        doc.line(15, yPos - 2, 280, yPos - 2);

        data.forEach((item) => {
          if (yPos > pageHeight - 20) {
            doc.addPage();
            yPos = 20;
          }

          doc.text(item.date || '', 15, yPos);
          doc.text((item.user_name || item.user_email || '').substring(0, 15), 40, yPos);
          doc.text((item.store_name || '').substring(0, 10), 80, yPos);
          doc.text(item.start_time?.slice(0, 5) || '', 110, yPos);
          doc.text(item.end_time?.slice(0, 5) || '', 135, yPos);
          doc.text(item.is_confirmed ? 'O' : '', 160, yPos);
          doc.text((item.notes || '').substring(0, 25), 180, yPos);
          
          yPos += lineHeight;
        });
      } else if (type === 'users') {
        // ユーザーデータ
        doc.setFontSize(9);
        
        doc.text('氏名', 15, yPos);
        doc.text('メール', 50, yPos);
        doc.text('権限', 100, yPos);
        doc.text('所属店舗', 130, yPos);
        doc.text('雇用形態', 170, yPos);
        doc.text('時給', 200, yPos);
        doc.text('登録日', 230, yPos);
        
        yPos += lineHeight;
        doc.line(15, yPos - 2, 280, yPos - 2);

        data.forEach((item) => {
          if (yPos > pageHeight - 20) {
            doc.addPage();
            yPos = 20;
          }

          const roleLabel = item.user_role === 'admin' ? '管理者' : 
                           item.user_role === 'manager' ? 'マネージャー' : 'ユーザー';
          
          doc.text((item.metadata?.display_name || item.full_name || '').substring(0, 12), 15, yPos);
          doc.text((item.email || '').substring(0, 20), 50, yPos);
          doc.text(roleLabel, 100, yPos);
          doc.text((item.store_names?.join('・') || '').substring(0, 15), 130, yPos);
          doc.text((item.employment_type || '').substring(0, 10), 170, yPos);
          doc.text((item.hourly_wage || '').toString(), 200, yPos);
          doc.text(item.created_date ? format(new Date(item.created_date), 'yyyy/MM/dd', { locale: ja }) : '', 230, yPos);
          
          yPos += lineHeight;
        });
      }

      doc.save(`${filename}_${format(new Date(), 'yyyyMMdd')}.pdf`);
      toast.success('PDFファイルをエクスポートしました');
    } catch (error) {
      console.error('PDF export error:', error);
      toast.error('エクスポートに失敗しました');
    } finally {
      setIsExporting(false);
    }
  };

  if (data.length === 0) {
    return null;
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button 
          variant={variant} 
          size={size} 
          disabled={disabled || isExporting}
        >
          <Download className="w-4 h-4 mr-2" />
          エクスポート
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem onClick={exportToCSV}>
          <Table className="w-4 h-4 mr-2" />
          CSV形式
        </DropdownMenuItem>
        <DropdownMenuItem onClick={exportToPDF}>
          <FileText className="w-4 h-4 mr-2" />
          PDF形式
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}