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
