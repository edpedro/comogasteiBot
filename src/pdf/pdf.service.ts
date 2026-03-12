import { Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import { Compra } from '../compras/compra.entity';

@Injectable()
export class PdfService {
  async generateInvoicePdf(compras: Compra[], month: string): Promise<Buffer> {
    return new Promise((resolve) => {
      const doc = new PDFDocument({ margin: 40, size: 'A4' });
      const buffers: Buffer[] = [];

      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => {
        const pdfData = Buffer.concat(buffers);
        resolve(pdfData);
      });

      const formatMoney = (value: number) =>
        new Intl.NumberFormat('pt-BR', {
          style: 'currency',
          currency: 'BRL',
        }).format(value);

      const toMonthLabel = (monthKey: string) => {
        const m = String(monthKey || '').trim();
        const match = m.match(/^(\d{4})-(\d{2})$/);
        if (!match) return m;
        const [, y, mm] = match;
        return `${mm}/${y}`;
      };

      const formatDate = (value: unknown) => {
        if (!value) return '';
        if (typeof value === 'string') {
          const s = value.slice(0, 10);
          if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
            const [, m, d] = s.split('-');
            return `${d}/${m}/${s.split('-')[0]}`;
          }
          if (/^\d{4}-\d{2}$/.test(s)) return toMonthLabel(s);
          return value;
        }
        if (value instanceof Date) {
          const dtf = new Intl.DateTimeFormat('pt-BR', {
            timeZone: 'America/Sao_Paulo',
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
          });
          return dtf.format(value);
        }
        return String(value);
      };

      const accent = '#E4572E';
      const lightRow = '#F6F7F9';
      const headerText = '#111827';
      const mutedText = '#6B7280';

      doc.rect(0, 0, 14, doc.page.height).fill(accent);
      doc.fillColor(headerText);

      const pageLeft = doc.page.margins.left;
      const pageRight = doc.page.width - doc.page.margins.right;

      const nowLabel = new Intl.DateTimeFormat('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }).format(new Date());

      const titleY = doc.y;
      doc
        .font('Helvetica-Bold')
        .fontSize(26)
        .text('FATURA', pageLeft, titleY, { align: 'left' });

      doc
        .font('Helvetica')
        .fontSize(10)
        .fillColor(mutedText)
        .text(`Mês: ${toMonthLabel(month)}`, pageLeft, titleY + 34, {
          align: 'left',
        });

      doc
        .font('Helvetica')
        .fontSize(10)
        .fillColor(mutedText)
        .text(`Gerado em: ${nowLabel}`, pageLeft, titleY + 34, {
          align: 'right',
        });

      doc
        .moveTo(pageLeft, titleY + 58)
        .lineTo(pageRight, titleY + 58)
        .lineWidth(1)
        .strokeColor('#E5E7EB')
        .stroke();

      doc.moveDown(2);

      // Group by Card/Type
      const groups = new Map<string, Compra[]>();

      compras.forEach((c) => {
        let key = c.cartao ? c.cartao.nome : 'Outros';
        if (c.tipo === 'DINHEIRO') key = 'Dinheiro';
        if (c.tipo === 'PIX') key = 'Pix';

        if (!groups.has(key)) {
          groups.set(key, []);
        }
        groups.get(key)!.push(c);
      });

      const sortedGroups = Array.from(groups.entries()).sort((a, b) =>
        a[0].localeCompare(b[0], 'pt-BR', { sensitivity: 'base' }),
      );

      let totalGeral = 0;

      const ensureSpace = (height: number) => {
        const bottom = doc.page.height - doc.page.margins.bottom - 40;
        if (doc.y + height > bottom) {
          doc.addPage();
          doc.rect(0, 0, 14, doc.page.height).fill(accent);
          doc.fillColor(headerText);
        }
      };

      const drawTableHeader = () => {
        const rowH = 22;
        ensureSpace(rowH);
        const y = doc.y;
        doc
          .save()
          .fillColor(accent)
          .rect(pageLeft, y, pageRight - pageLeft, rowH)
          .fill()
          .restore();

        doc.fillColor('white').font('Helvetica-Bold').fontSize(10);

        const cols = {
          item: { x: pageLeft + 8, w: 30, align: 'left' as const },
          data: { x: pageLeft + 42, w: 70, align: 'left' as const },
          desc: { x: pageLeft + 112, w: 230, align: 'left' as const },
          parc: { x: pageLeft + 342, w: 52, align: 'center' as const },
          quem: { x: pageLeft + 394, w: 120, align: 'left' as const },
          valor: { x: pageRight - 110, w: 100, align: 'right' as const },
        };

        doc.text('#', cols.item.x, y + 6, { width: cols.item.w });
        doc.text('Data', cols.data.x, y + 6, { width: cols.data.w });
        doc.text('Descrição', cols.desc.x, y + 6, { width: cols.desc.w });
        doc.text('Parc.', cols.parc.x, y + 6, {
          width: cols.parc.w,
          align: cols.parc.align,
        });
        doc.text('Nome', cols.quem.x, y + 6, { width: cols.quem.w });
        doc.text('Total', cols.valor.x, y + 6, {
          width: cols.valor.w,
          align: cols.valor.align,
        });

        doc.y = y + rowH + 6;
        doc.fillColor(headerText).font('Helvetica').fontSize(10);
        return cols;
      };

      const drawGroupHeader = (groupName: string) => {
        ensureSpace(36);
        doc
          .fillColor(headerText)
          .font('Helvetica-Bold')
          .fontSize(14)
          .text(groupName, pageLeft, doc.y, { align: 'left' });
        doc.moveDown(0.4);
        doc
          .moveTo(pageLeft, doc.y)
          .lineTo(pageRight, doc.y)
          .lineWidth(1)
          .strokeColor('#E5E7EB')
          .stroke();
        doc.moveDown(0.6);
      };

      for (const [groupName, items] of sortedGroups) {
        const ordered = [...items].sort((a, b) => {
          const da = String(a.dataCompra || '');
          const db = String(b.dataCompra || '');
          if (da !== db) return da.localeCompare(db);
          const ha = String(a.horaCompra || '');
          const hb = String(b.horaCompra || '');
          if (ha !== hb) return ha.localeCompare(hb);
          return String(a.id || '').localeCompare(String(b.id || ''));
        });

        drawGroupHeader(groupName);
        let cols = drawTableHeader();
        let totalGroup = 0;
        let idx = 1;

        for (const item of ordered) {
          const rowH = 22;
          ensureSpace(rowH + 10);

          if (doc.y + rowH > doc.page.height - doc.page.margins.bottom - 50) {
            doc.addPage();
            doc.rect(0, 0, 14, doc.page.height).fill(accent);
            doc.fillColor(headerText);
            drawGroupHeader(groupName);
            cols = drawTableHeader();
          }

          const y = doc.y - 6;
          if (idx % 2 === 0) {
            doc
              .save()
              .fillColor(lightRow)
              .rect(pageLeft, y, pageRight - pageLeft, rowH)
              .fill()
              .restore();
          }

          const date = formatDate(item.dataCompra);
          const valor = Number(item.valorParcela);
          totalGroup += valor;

          doc.fillColor(headerText).font('Helvetica').fontSize(10);

          doc.text(String(idx), cols.item.x, y + 6, {
            width: cols.item.w,
          });
          doc.text(date, cols.data.x, y + 6, { width: cols.data.w });
          doc.text(
            this.truncateText(String(item.descricao || ''), 60),
            cols.desc.x,
            y + 6,
            {
              width: cols.desc.w,
            },
          );
          const parc =
            item.parcelas && item.parcelaAtual
              ? `${item.parcelaAtual}/${item.parcelas}`
              : '';
          doc.text(parc, cols.parc.x, y + 6, {
            width: cols.parc.w,
            align: cols.parc.align,
          });
          doc.text(
            this.truncateText(String(item.nome || ''), 22),
            cols.quem.x,
            y + 6,
            {
              width: cols.quem.w,
            },
          );
          doc.text(formatMoney(valor), cols.valor.x, y + 6, {
            width: cols.valor.w,
            align: cols.valor.align,
          });

          doc.y = y + rowH + 6;
          idx += 1;
        }

        ensureSpace(70);
        doc.moveDown(0.2);
        doc
          .moveTo(pageLeft, doc.y)
          .lineTo(pageRight, doc.y)
          .lineWidth(1)
          .strokeColor('#E5E7EB')
          .stroke();
        doc.moveDown(0.6);

        doc.font('Helvetica').fontSize(10).fillColor(mutedText);
        doc.text('Subtotal', pageRight - 220, doc.y, {
          width: 110,
          align: 'right',
        });
        doc.font('Helvetica-Bold').fillColor(headerText);
        doc.text(formatMoney(totalGroup), pageRight - 110, doc.y, {
          width: 100,
          align: 'right',
        });
        doc.moveDown(1.0);

        totalGeral += totalGroup;
      }

      // Grand Total
      ensureSpace(120);
      doc.moveDown(0.5);
      doc
        .moveTo(pageLeft, doc.y)
        .lineTo(pageRight, doc.y)
        .lineWidth(1)
        .strokeColor('#E5E7EB')
        .stroke();
      doc.moveDown(0.8);

      doc.font('Helvetica').fontSize(11).fillColor(mutedText);
      doc.text('TOTAL GERAL', pageRight - 220, doc.y, {
        width: 110,
        align: 'right',
      });
      doc.font('Helvetica-Bold').fontSize(14).fillColor(headerText);
      doc.text(formatMoney(totalGeral), pageRight - 110, doc.y - 2, {
        width: 100,
        align: 'right',
      });

      doc.moveDown(2.0);
      doc.font('Helvetica').fontSize(8).fillColor(mutedText);
      doc
        .moveTo(pageLeft, doc.page.height - doc.page.margins.bottom - 26)
        .lineTo(pageRight, doc.page.height - doc.page.margins.bottom - 26)
        .lineWidth(1)
        .strokeColor('#E5E7EB')
        .stroke();
      doc.text(
        `Relatório gerado automaticamente em ${nowLabel} (Brasília).`,
        pageLeft,
        doc.page.height - doc.page.margins.bottom - 20,
        { align: 'left' },
      );

      doc.end();
    });
  }

  private truncateText(text: string, maxLength: number) {
    const t = (text || '').trim();
    if (t.length <= maxLength) return t;
    return `${t.slice(0, Math.max(0, maxLength - 1))}…`;
  }
}
