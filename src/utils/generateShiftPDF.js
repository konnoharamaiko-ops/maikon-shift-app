import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { format } from 'date-fns';
import { ja } from 'date-fns/locale';

/**
 * シフト表のHTMLをPDFに変換
 * @param {HTMLElement} element - PDF化するHTML要素
 * @param {string} filename - PDFファイル名
 * @returns {Promise<Blob>} PDFのBlob
 */
export async function generateShiftPDF(element, filename = 'shift.pdf') {
  try {
    // HTML要素をCanvasに変換
    const canvas = await html2canvas(element, {
      scale: 2, // 高解像度
      useCORS: true,
      logging: false,
      backgroundColor: '#ffffff',
    });

    // CanvasをPDFに変換
    const imgData = canvas.toDataURL('image/png');
    const pdf = new jsPDF({
      orientation: 'landscape', // 横向き
      unit: 'mm',
      format: 'a4',
    });

    const imgWidth = 297; // A4横向きの幅
    const imgHeight = (canvas.height * imgWidth) / canvas.width;

    pdf.addImage(imgData, 'PNG', 0, 0, imgWidth, imgHeight);

    // PDFをBlobとして返す
    return pdf.output('blob');
  } catch (error) {
    console.error('[PDF Generation Error]', error);
    throw error;
  }
}

/**
 * シフト表のHTMLをPDFとしてダウンロード
 * @param {HTMLElement} element - PDF化するHTML要素
 * @param {string} filename - PDFファイル名
 */
export async function downloadShiftPDF(element, filename = 'shift.pdf') {
  try {
    const pdfBlob = await generateShiftPDF(element, filename);
    
    // ダウンロード
    const url = URL.createObjectURL(pdfBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  } catch (error) {
    console.error('[PDF Download Error]', error);
    throw error;
  }
}

/**
 * シフト表データからPDFを生成（テーブル形式）
 * @param {Array} shifts - シフトデータ配列
 * @param {Object} options - オプション
 * @returns {Promise<Blob>} PDFのBlob
 */
export async function generateShiftTablePDF(shifts, options = {}) {
  const {
    month = new Date(),
    storeName = '店舗',
    users = [],
  } = options;

  try {
    const pdf = new jsPDF({
      orientation: 'landscape',
      unit: 'mm',
      format: 'a4',
    });

    // 日本語フォント設定（必要に応じて）
    // pdf.addFont('path/to/font.ttf', 'japanese', 'normal');
    // pdf.setFont('japanese');

    // タイトル
    pdf.setFontSize(16);
    pdf.text(`${storeName} シフト表`, 10, 15);
    pdf.setFontSize(12);
    pdf.text(format(month, 'yyyy年M月', { locale: ja }), 10, 25);

    // テーブル作成
    const tableData = [];
    const headers = ['日付', '曜日', ...users.map(u => u.display_name || u.full_name)];

    // 日付ごとにデータを整理
    const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(month.getFullYear(), month.getMonth(), day);
      const dateStr = format(date, 'yyyy-MM-dd');
      const dayOfWeek = format(date, 'E', { locale: ja });
      
      const row = [
        format(date, 'M/d'),
        dayOfWeek,
      ];

      users.forEach(user => {
        const shift = shifts.find(s => s.date === dateStr && s.user_id === user.id);
        if (shift) {
          row.push(`${shift.start_time}-${shift.end_time}`);
        } else {
          row.push('-');
        }
      });

      tableData.push(row);
    }

    // テーブル描画（簡易版）
    let y = 35;
    const cellHeight = 7;
    const cellWidths = [15, 10, ...users.map(() => (270 - 25) / users.length)];

    // ヘッダー
    pdf.setFillColor(200, 200, 200);
    pdf.rect(10, y, 270, cellHeight, 'F');
    pdf.setFontSize(10);
    let x = 10;
    headers.forEach((header, i) => {
      pdf.text(header, x + 2, y + 5);
      x += cellWidths[i];
    });

    y += cellHeight;

    // データ行
    tableData.forEach((row, rowIndex) => {
      x = 10;
      row.forEach((cell, cellIndex) => {
        pdf.rect(x, y, cellWidths[cellIndex], cellHeight);
        pdf.text(cell.toString(), x + 2, y + 5);
        x += cellWidths[cellIndex];
      });
      y += cellHeight;

      // ページ分割
      if (y > 180 && rowIndex < tableData.length - 1) {
        pdf.addPage();
        y = 15;
      }
    });

    return pdf.output('blob');
  } catch (error) {
    console.error('[PDF Table Generation Error]', error);
    throw error;
  }
}

/**
 * PDFをBase64エンコード（メール添付用）
 * @param {Blob} pdfBlob - PDFのBlob
 * @returns {Promise<string>} Base64エンコードされたPDF
 */
export async function pdfToBase64(pdfBlob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64 = reader.result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(pdfBlob);
  });
}
