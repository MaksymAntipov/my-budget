import { formatMoney } from './utils.js';

const PAGE_W = 1240;
const PAGE_H = 1754;
const MARGIN_X = 80;
const CONTENT_W = PAGE_W - MARGIN_X * 2;
const A4_W = 595.28;
const A4_H = 841.89;
const FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif';

function money(n) {
    return `${formatMoney(n)} ₴`;
}

function drawRoundRect(ctx, x, y, w, h, r) {
    const radius = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
}

function fitText(ctx, text, maxWidth) {
    let display = String(text || '—');
    while (ctx.measureText(display).width > maxWidth && display.length > 8) {
        display = `${display.slice(0, -4)}…`;
    }
    return display;
}

function drawKeyValueRow(ctx, x, y, width, label, value, opts = {}) {
    const {
        labelWeight = '500',
        valueWeight = '600',
        size = 28,
        labelColor = '#6e6e73',
        valueColor = '#1c1c1e',
        padX = 0,
    } = opts;
    ctx.fillStyle = labelColor;
    ctx.font = `${labelWeight} ${size}px ${FONT}`;
    ctx.textAlign = 'left';
    ctx.fillText(label, x + padX, y);
    ctx.fillStyle = valueColor;
    ctx.font = `${valueWeight} ${size}px ${FONT}`;
    ctx.textAlign = 'right';
    ctx.fillText(fitText(ctx, value, width * 0.55), x + width - padX, y);
    ctx.textAlign = 'left';
}

function drawHairline(ctx, x, y, width, color = '#e5e5ea') {
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + width, y);
    ctx.stroke();
}

function drawPayslipCanvas(slip, periodLabel, dateLabel) {
    const canvas = document.createElement('canvas');
    canvas.width = PAGE_W;
    canvas.height = PAGE_H;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D недоступний');

    // Soft page background
    ctx.fillStyle = '#f2f2f7';
    ctx.fillRect(0, 0, PAGE_W, PAGE_H);

    // White sheet card
    const sheetX = 48;
    const sheetY = 48;
    const sheetW = PAGE_W - 96;
    const sheetH = PAGE_H - 96;
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = 'rgba(0,0,0,0.08)';
    ctx.shadowBlur = 28;
    ctx.shadowOffsetY = 10;
    drawRoundRect(ctx, sheetX, sheetY, sheetW, sheetH, 28);
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;

    const contentX = sheetX + 56;
    const contentW = sheetW - 112;
    let y = sheetY + 72;

    // Accent bar under title
    ctx.fillStyle = '#0a84ff';
    ctx.font = `800 46px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText('РОЗРАХУНКОВИЙ ЛИСТОК', PAGE_W / 2, y);
    ctx.textAlign = 'left';

    y += 18;
    ctx.fillStyle = '#0a84ff';
    drawRoundRect(ctx, PAGE_W / 2 - 36, y, 72, 5, 3);
    ctx.fill();

    y += 48;
    ctx.fillStyle = '#8e8e93';
    ctx.font = `500 24px ${FONT}`;
    ctx.fillText(`Період: ${periodLabel}`, contentX, y);
    ctx.textAlign = 'right';
    ctx.fillText(dateLabel, contentX + contentW, y);
    ctx.textAlign = 'left';

    // Employee card
    y += 36;
    const infoCardY = y;
    const infoCardH = 176;
    ctx.fillStyle = '#f7f7fa';
    drawRoundRect(ctx, contentX, infoCardY, contentW, infoCardH, 20);
    ctx.fill();
    ctx.strokeStyle = '#ececf0';
    ctx.lineWidth = 1.5;
    drawRoundRect(ctx, contentX, infoCardY, contentW, infoCardH, 20);
    ctx.stroke();

    const infoRows = [
        ['ПІБ', slip.name || '—'],
        ['ІПН', slip.taxId || '—'],
        ['Рахунок', slip.account || '—'],
    ];
    let infoY = infoCardY + 48;
    infoRows.forEach(([label, value]) => {
        drawKeyValueRow(ctx, contentX, infoY, contentW, label, value, {
            size: 26,
            labelWeight: '600',
            valueWeight: '700',
            padX: 28,
            labelColor: '#8e8e93',
            valueColor: '#1c1c1e',
        });
        infoY += 44;
    });

    // Calculation block
    y = infoCardY + infoCardH + 48;
    ctx.fillStyle = '#1c1c1e';
    ctx.font = `800 26px ${FONT}`;
    ctx.fillText('РОЗРАХУНОК', contentX, y);

    y += 28;
    const rows = [];
    rows.push({ label: 'Тип оплати', value: slip.payTypeLabel });

    if (slip.isHourly) {
        rows.push({ label: 'Відпрацьовано годин', value: String(slip.hours) });
        rows.push({ label: 'Ставка за годину', value: money(slip.rate) });
        rows.push({ label: slip.baseLabel, value: money(slip.base), strong: true, dividerBefore: true });
    } else {
        rows.push({ label: 'Фікс ставка', value: money(slip.rate) });
        rows.push({ label: 'База (фікс)', value: money(slip.base), strong: true, dividerBefore: true });
    }

    if (slip.bonus > 0) rows.push({ label: 'Премія', value: `+${money(slip.bonus)}`, valueColor: '#248a3d' });
    if (slip.penalty > 0) rows.push({ label: 'Штраф', value: `-${money(slip.penalty)}`, valueColor: '#d70015' });

    rows.push({ label: 'Нараховано загалом', value: money(slip.accrued), strong: true, dividerBefore: true, size: 30 });

    // Аванс — лише якщо реально був
    if (slip.advance > 0) {
        rows.push({ label: 'Аванс', value: `-${money(slip.advance)}`, valueColor: '#6e6e73' });
    }

    const calcBottomPad = 28;
    const rowH = 46;
    let calcH = calcBottomPad + 24;
    rows.forEach((r) => {
        calcH += rowH;
        if (r.dividerBefore) calcH += 14;
    });
    calcH += 90; // total footer strip

    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#ececf0';
    ctx.lineWidth = 1.5;
    drawRoundRect(ctx, contentX, y, contentW, calcH, 20);
    ctx.fill();
    ctx.stroke();

    let rowY = y + 44;
    rows.forEach((row) => {
        if (row.dividerBefore) {
            drawHairline(ctx, contentX + 24, rowY - 18, contentW - 48);
            rowY += 8;
        }
        drawKeyValueRow(ctx, contentX, rowY, contentW, row.label, row.value, {
            size: row.size || 27,
            labelWeight: row.strong ? '700' : '500',
            valueWeight: row.strong ? '700' : '600',
            padX: 28,
            labelColor: row.strong ? '#1c1c1e' : '#6e6e73',
            valueColor: row.valueColor || '#1c1c1e',
        });
        rowY += rowH;
    });

    // Final status strip
    const stripY = y + calcH - 78;
    drawHairline(ctx, contentX + 24, stripY - 8, contentW - 48, '#d8d8dc');

    if (slip.isPaid) {
        // Fully paid — show amount paid, not "0 to pay"
        ctx.fillStyle = 'rgba(46, 160, 67, 0.1)';
        drawRoundRect(ctx, contentX + 16, stripY, contentW - 32, 56, 14);
        ctx.fill();
        drawKeyValueRow(ctx, contentX, stripY + 36, contentW, 'Виплачено', money(slip.accrued), {
            size: 32,
            labelWeight: '800',
            valueWeight: '800',
            padX: 36,
            labelColor: '#248a3d',
            valueColor: '#248a3d',
        });
    } else {
        ctx.fillStyle = 'rgba(10, 132, 255, 0.08)';
        drawRoundRect(ctx, contentX + 16, stripY, contentW - 32, 56, 14);
        ctx.fill();
        drawKeyValueRow(ctx, contentX, stripY + 36, contentW, 'До виплати', money(slip.toPay), {
            size: 32,
            labelWeight: '800',
            valueWeight: '800',
            padX: 36,
            labelColor: '#0a84ff',
            valueColor: '#0a84ff',
        });
    }

    return canvas;
}

function canvasToJpegBytes(canvas, quality = 0.92) {
    const dataUrl = canvas.toDataURL('image/jpeg', quality);
    const base64 = dataUrl.split(',')[1];
    if (!base64) throw new Error('Не вдалося закодувати сторінку');
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
}

function concatBytes(chunks) {
    let total = 0;
    for (const c of chunks) total += c.length;
    const out = new Uint8Array(total);
    let offset = 0;
    for (const c of chunks) {
        out.set(c, offset);
        offset += c.length;
    }
    return out;
}

function buildPdfFromJpegs(jpegPages) {
    const enc = new TextEncoder();
    const chunks = [];
    let size = 0;
    const write = (data) => {
        const bytes = typeof data === 'string' ? enc.encode(data) : data;
        chunks.push(bytes);
        size += bytes.length;
    };

    write('%PDF-1.4\n');

    const catalogNum = 1;
    const pagesNum = 2;
    let nextNum = 3;
    const pageNums = [];
    const objectBodies = new Map();

    objectBodies.set(catalogNum, enc.encode(`<< /Type /Catalog /Pages ${pagesNum} 0 R >>`));

    jpegPages.forEach((jpeg) => {
        const imageNum = nextNum++;
        const contentNum = nextNum++;
        const pageNum = nextNum++;
        pageNums.push(pageNum);

        const contentStream = enc.encode(
            `q\n${A4_W.toFixed(2)} 0 0 ${A4_H.toFixed(2)} 0 0 cm\n/Im0 Do\nQ\n`
        );

        objectBodies.set(imageNum, {
            dict: `<< /Type /XObject /Subtype /Image /Width ${PAGE_W} /Height ${PAGE_H} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>`,
            stream: jpeg,
        });
        objectBodies.set(contentNum, {
            dict: `<< /Length ${contentStream.length} >>`,
            stream: contentStream,
        });
        objectBodies.set(
            pageNum,
            enc.encode(
                `<< /Type /Page /Parent ${pagesNum} 0 R /MediaBox [0 0 ${A4_W.toFixed(2)} ${A4_H.toFixed(2)}] /Contents ${contentNum} 0 R /Resources << /XObject << /Im0 ${imageNum} 0 R >> >> >>`
            )
        );
    });

    objectBodies.set(
        pagesNum,
        enc.encode(
            `<< /Type /Pages /Kids [${pageNums.map((n) => `${n} 0 R`).join(' ')}] /Count ${pageNums.length} >>`
        )
    );

    const maxObj = nextNum - 1;
    const xref = new Array(maxObj + 1);

    for (let n = 1; n <= maxObj; n++) {
        xref[n] = size;
        const body = objectBodies.get(n);
        write(`${n} 0 obj\n`);
        if (body instanceof Uint8Array) {
            write(body);
            write('\nendobj\n');
        } else {
            write(`${body.dict}\nstream\n`);
            write(body.stream);
            write('\nendstream\nendobj\n');
        }
    }

    const xrefStart = size;
    write(`xref\n0 ${maxObj + 1}\n`);
    write('0000000000 65535 f \n');
    for (let n = 1; n <= maxObj; n++) {
        write(`${String(xref[n]).padStart(10, '0')} 00000 n \n`);
    }
    write(`trailer\n<< /Size ${maxObj + 1} /Root ${catalogNum} 0 R >>\nstartxref\n${xrefStart}\n%%EOF`);

    return concatBytes(chunks);
}

function triggerDownload(bytes, fileName) {
    const blob = new Blob([bytes], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function downloadPayrollPayslips(slips, options = {}) {
    if (!Array.isArray(slips) || slips.length === 0) {
        throw new Error('Немає співробітників для PDF');
    }

    const periodLabel = options.periodLabel || '';
    const dateLabel = options.dateLabel || '';
    const fileName = options.fileName || 'rozrahunkovyj-lystok.pdf';

    const jpegs = slips.map((slip) => canvasToJpegBytes(drawPayslipCanvas(slip, periodLabel, dateLabel)));
    triggerDownload(buildPdfFromJpegs(jpegs), fileName);
}
