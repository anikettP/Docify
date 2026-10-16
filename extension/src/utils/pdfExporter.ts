import html2pdf from 'html2pdf.js';

export function exportToPDF(element: HTMLElement, filename: string = 'document.pdf'): Promise<void> {
  const opt = {
    margin: [12, 12, 12, 12] as [number, number, number, number],
    filename: filename.endsWith('.pdf') ? filename : `${filename}.pdf`,
    image: { type: 'jpeg' as const, quality: 0.98 },
    html2canvas: { scale: 2, useCORS: true, logging: false },
    jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' as const }
  };

  return html2pdf().set(opt).from(element).save();
}

export function exportToMarkdown(htmlContent: string, title: string = 'document') {
  // Simple HTML to MD converter for common tags
  let md = htmlContent
    .replace(/<h1>(.*?)<\/h1>/gi, '# $1\n\n')
    .replace(/<h2>(.*?)<\/h2>/gi, '## $1\n\n')
    .replace(/<h3>(.*?)<\/h3>/gi, '### $1\n\n')
    .replace(/<p>(.*?)<\/p>/gi, '$1\n\n')
    .replace(/<li><p>(.*?)<\/p><\/li>/gi, '- $1\n')
    .replace(/<li>(.*?)<\/li>/gi, '- $1\n')
    .replace(/<ul>/gi, '')
    .replace(/<\/ul>/gi, '\n')
    .replace(/<ol>/gi, '')
    .replace(/<\/ol>/gi, '\n')
    .replace(/<strong>(.*?)<\/strong>/gi, '**$1**')
    .replace(/<em>(.*?)<\/em>/gi, '*$1*')
    .replace(/<a href="(.*?)">(.*?)<\/a>/gi, '[$2]($1)')
    .replace(/<[^>]+>/g, '');

  const blob = new Blob([md.trim()], { type: 'text/markdown;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', `${title.toLowerCase().replace(/[^a-z0-9]/gi, '_')}.md`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export function exportToText(htmlContent: string, title: string = 'document') {
  const temp = document.createElement('div');
  temp.innerHTML = htmlContent;
  const text = temp.innerText || temp.textContent || '';

  const blob = new Blob([text], { type: 'text/plain;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', `${title.toLowerCase().replace(/[^a-z0-9]/gi, '_')}.txt`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export function exportToWord(htmlContent: string, title: string = 'document') {
  // Wrap in a full HTML doc with Word-compatible namespace — opens natively in MS Word
  const wordHtml = `
    <html xmlns:o='urn:schemas-microsoft-com:office:office'
          xmlns:w='urn:schemas-microsoft-com:office:word'
          xmlns='http://www.w3.org/TR/REC-html40'>
    <head>
      <meta charset='utf-8'>
      <title>${title}</title>
      <!--[if gte mso 9]>
      <xml>
        <w:WordDocument>
          <w:View>Print</w:View>
          <w:Zoom>100</w:Zoom>
          <w:DoNotOptimizeForBrowser/>
        </w:WordDocument>
      </xml>
      <![endif]-->
      <style>
        body { font-family: Calibri, Arial, sans-serif; font-size: 11pt; line-height: 1.6; margin: 2cm; }
        h1 { font-size: 22pt; font-weight: bold; color: #111; margin-bottom: 12pt; }
        h2 { font-size: 15pt; font-weight: bold; color: #111; margin-top: 18pt; margin-bottom: 8pt; border-bottom: 1pt solid #ddd; padding-bottom: 4pt; }
        h3 { font-size: 13pt; font-weight: bold; color: #333; margin-top: 14pt; }
        p  { margin-bottom: 8pt; }
        ul, ol { margin-left: 18pt; margin-bottom: 8pt; }
        li { margin-bottom: 4pt; }
        a  { color: #6d28d9; }
        blockquote { border-left: 3pt solid #8b5cf6; padding-left: 12pt; color: #555; margin: 10pt 0; }
      </style>
    </head>
    <body>${htmlContent}</body>
    </html>`;

  const blob = new Blob([wordHtml], { type: 'application/msword' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', `${title.replace(/[^a-z0-9\s]/gi, '').trim() || 'document'}.doc`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
