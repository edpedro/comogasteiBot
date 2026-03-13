import { Injectable, Logger } from '@nestjs/common';
import {
  Update,
  Start,
  Command,
  On,
  Action,
  Ctx,
  InjectBot,
} from 'nestjs-telegraf';
import { Context, Markup, Telegraf } from 'telegraf';
import { CartoesService } from '../cartoes/cartoes.service';
import { ComprasService } from '../compras/compras.service';
import { PdfService } from '../pdf/pdf.service';
import { addMonths } from 'date-fns';
import { Cron, CronExpression } from '@nestjs/schedule';

interface WizardState {
  type: 'PURCHASE' | 'CARD' | 'PDF' | 'EDIT' | 'EDIT_SELECT' | 'CANCEL_SELECT';
  step: string;
  data: any;
}

@Update()
@Injectable()
export class TelegramService {
  private readonly logger = new Logger(TelegramService.name);
  private userStates = new Map<number, WizardState>();

  constructor(
    @InjectBot() private readonly bot: Telegraf<Context>,
    private readonly cartoesService: CartoesService,
    private readonly comprasService: ComprasService,
    private readonly pdfService: PdfService,
  ) {}

  @Start()
  async start(@Ctx() ctx: Context) {
    const msg = [
      '<b>FinBot</b>',
      '',
      '<b>Compras</b>',
      '<code>/nova</code> Registrar nova compra (por botões)',
      '<code>/compras</code> Listar compras do mês',
      '<code>/fatura</code> Ver fatura do mês',
      '<code>/editar</code> Editar compra (seleção por data)',
      '<code>/cancelar</code> Remover compra (seleção por data)',
      '',
      '<b>Cartões</b>',
      '<code>/cartoes</code> Listar cartões',
      '<code>/novo_cartao</code> Cadastrar novo cartão',
      '',
      '<b>Relatórios</b>',
      '<code>/listar</code> Selecionar fatura por botões (mês atual)',
      '<code>/pdf</code> Baixar relatório PDF',
      '',
      '<b>Exemplos</b>',
      '<pre>/compras 04 nubank\n/compras 03/2026 itau\n/fatura nubank</pre>',
      '',
      '<i>Dica:</i> use <code>/nova</code> para escolher o cartão por botões.',
    ].join('\n');

    await ctx.reply(msg, {
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    });
  }

  @Command('ajuda')
  async ajuda(@Ctx() ctx: Context) {
    await this.start(ctx);
  }

  // --- CARTÕES ---

  @Command('cartoes')
  async listCartoes(@Ctx() ctx: Context) {
    const cartoes = await this.cartoesService.findAll();
    if (!cartoes.length) {
      return ctx.reply(
        'Nenhum cartão cadastrado. Use /novo_cartao para começar.',
      );
    }
    const list = cartoes
      .map((c) => {
        const tipo = c.tipo === 'pix' ? '💠 PIX' : '💳 Cartão';
        const fechamento = c.dataFechamento
          ? ` | Fechamento: dia ${c.dataFechamento}`
          : '';
        const limite = c.limite ? ` | Limite: R$ ${c.limite}` : '';
        return `${tipo} ${c.nome}${fechamento}${limite}`;
      })
      .join('\n');
    await ctx.reply(`Seus cartões:\n\n${list}`);
  }

  @Command('novo_cartao')
  async novoCartao(@Ctx() ctx: Context) {
    if (!ctx.chat?.id) return;
    this.userStates.set(ctx.chat.id, {
      type: 'CARD',
      step: 'NAME',
      data: { chatId: ctx.chat.id },
    });
    await ctx.reply('Qual o nome do cartão ou conta? (Ex: Nubank, Itaú)');
  }

  // --- COMPRAS ---

  @Command('nova')
  async novaCompra(@Ctx() ctx: Context) {
    const cartoes = await this.cartoesService.findAll();

    const buttons = cartoes.map((c) =>
      Markup.button.callback(c.nome, `card:${c.id}`),
    );
    // Add Money and Pix options
    buttons.push(Markup.button.callback('💵 Dinheiro', 'card:DINHEIRO'));
    buttons.push(Markup.button.callback('💠 Pix', 'card:PIX'));

    const keyboard = Markup.inlineKeyboard(buttons, { columns: 2 });

    if (ctx.chat?.id) {
      this.userStates.set(ctx.chat.id, {
        type: 'PURCHASE',
        step: 'CARD',
        data: {},
      });
      await ctx.reply('Qual forma de pagamento?', keyboard);
    }
  }

  @Command('compras')
  async listCompras(@Ctx() ctx: Context) {
    // /compras [mes] [cartao]
    // @ts-ignore
    const text = ctx.message.text;
    const args = text.split(' ');

    let month = this.saoPauloNowMonthKey();
    const cardNameParts: string[] = [];

    if (args.length > 1) {
      // Simple heuristic: if arg contains number, it's month, else card name
      // Supports: /compras 04 nubank OR /compras nubank 04
      for (let i = 1; i < args.length; i++) {
        const arg = args[i];
        if (arg.match(/^\d{2}(\/\d{4})?$/)) {
          if (arg.length === 2) {
            month = `${this.saoPauloNowYear()}-${arg}`;
          } else {
            const [m, y] = arg.split('/');
            month = `${y}-${m}`;
          }
        } else {
          cardNameParts.push(arg);
        }
      }
    }
    const cardName = cardNameParts.join(' ');

    const compras = await this.comprasService.findByCardAndMonth(
      cardName,
      month,
    );

    if (compras.length === 0) {
      return ctx.reply(
        `Nenhuma compra encontrada para ${month}${cardName ? ` no cartão ${cardName}` : ''}.`,
      );
    }

    let response = `🛒 Compras de ${month}${cardName ? ` (${cardName})` : ''}:\n\n`;
    let total = 0;

    for (const c of compras) {
      const valor = Number(c.valorParcela);
      total += valor;
      const date = this.formatCompraDate(c.dataCompra);
      const cardInfo = c.cartao ? c.cartao.nome : c.tipo;
      response += `${date} - ${c.descricao} (${c.parcelaAtual}/${c.parcelas}): R$ ${valor.toFixed(2)} [${cardInfo}]\n`;
    }

    response += `\n💰 Total: R$ ${total.toFixed(2)}`;
    await ctx.reply(response);
  }

  @Command('fatura')
  async verFatura(@Ctx() ctx: Context) {
    // Similar logic to compras but optimized for invoice view
    // @ts-ignore
    const text = ctx.message.text;
    const args = text.split(' ');

    let month = this.saoPauloNowMonthKey();
    const cardNameParts: string[] = [];

    if (args.length > 1) {
      for (let i = 1; i < args.length; i++) {
        const arg = args[i];
        if (arg.match(/^\d{2}(\/\d{4})?$/)) {
          if (arg.length === 2) {
            month = `${this.saoPauloNowYear()}-${arg}`;
          } else {
            const [m, y] = arg.split('/');
            month = `${y}-${m}`;
          }
        } else {
          cardNameParts.push(arg);
        }
      }
    }
    const cardName = cardNameParts.join(' ');

    const compras = await this.comprasService.findByCardAndMonth(
      cardName,
      month,
    );
    if (compras.length === 0) {
      return ctx.reply('Sem faturas para este mês.');
    }

    // Listar: Data | Descrição | Valor | Nome
    let msg = `📄 Fatura ${month}:\nData | Desc | Valor | Nome\n--------------------------\n`;
    let total = 0;

    for (const c of compras) {
      const valor = Number(c.valorParcela);
      total += valor;
      const date = this.formatCompraDate(c.dataCompra);
      msg += `${date} | ${c.descricao} | R$${valor.toFixed(2)} | ${c.nome}\n`;
    }

    msg += `--------------------------\n💰 Total: R$ ${total.toFixed(2)}`;
    await ctx.reply(msg);
  }

  @Command('listar')
  async listarFaturas(@Ctx() ctx: Context) {
    const cartoes = await this.cartoesService.findAll();
    const buttons = cartoes.map((c) =>
      Markup.button.callback(c.nome, `list_card:${c.id}`),
    );
    buttons.push(Markup.button.callback('💵 Dinheiro', 'list_card:DINHEIRO'));
    buttons.push(Markup.button.callback('💠 Pix', 'list_card:PIX'));

    await ctx.reply(
      'Selecione o cartão/tipo para ver a fatura (mês atual):',
      Markup.inlineKeyboard(buttons, { columns: 2 }),
    );
  }

  @Command('pdf')
  async baixarPdf(@Ctx() ctx: Context) {
    if (!ctx.chat?.id) return;

    const currentMonthKey = this.saoPauloNowMonthKey();
    const prevMonthKey = this.shiftMonthKey(currentMonthKey, -1);
    const currentMonth = this.monthKeyToDisplay(currentMonthKey);
    const prevMonth = this.monthKeyToDisplay(prevMonthKey);

    const buttons = [
      Markup.button.callback(currentMonth, `pdf_month:${currentMonth}`),
      Markup.button.callback(prevMonth, `pdf_month:${prevMonth}`),
      Markup.button.callback('Outro', 'pdf_month:OTHER'),
    ];

    this.userStates.set(ctx.chat.id, {
      type: 'PDF',
      step: 'MONTH',
      data: {},
    });

    await ctx.reply(
      'Selecione o mês para o relatório:',
      Markup.inlineKeyboard(buttons, { columns: 2 }),
    );
  }

  @Command('cancelar')
  async cancelarCompra(@Ctx() ctx: Context) {
    if (!ctx.chat?.id) return;

    this.userStates.set(ctx.chat.id, {
      type: 'CANCEL_SELECT',
      step: 'DATE',
      data: {},
    });

    await ctx.reply("Qual a data da compra? (DD/MM, DD/MM/AAAA ou 'hoje')");
  }

  @Command('editar')
  async editarCompra(@Ctx() ctx: Context) {
    if (!ctx.chat?.id) return;

    this.userStates.set(ctx.chat.id, {
      type: 'EDIT_SELECT',
      step: 'DATE',
      data: {},
    });

    await ctx.reply("Qual a data da compra? (DD/MM, DD/MM/AAAA ou 'hoje')");
  }

  // --- ACTIONS & EVENTS ---

  @Action(/^edit_pick:(.+)$/)
  async onEditPick(@Ctx() ctx: Context) {
    // @ts-ignore
    const id = ctx.match[1];
    if (!ctx.chat?.id) return;

    try {
      const compra = await this.comprasService.findOne(id);

      this.userStates.set(ctx.chat.id, {
        type: 'EDIT',
        step: 'VALUE',
        data: { id, original: compra, updates: {} },
      });

      await ctx.reply(
        `Editando compra: ${compra.descricao} (R$ ${compra.valor})\n\n` +
          `Digite o novo VALOR (ou 'manter' para não alterar):`,
      );
    } catch (e) {
      await ctx.reply('Erro ao carregar compra para edição.');
    }

    try {
      await ctx.answerCbQuery();
    } catch (e) {}
  }

  @Action(/^cancel_pick:(.+)$/)
  async onCancelPick(@Ctx() ctx: Context) {
    // @ts-ignore
    const id = ctx.match[1];
    if (!ctx.chat?.id) return;

    try {
      await this.comprasService.remove(id);
      await ctx.reply(`✅ Compra removida com sucesso.`);
    } catch (e) {
      await ctx.reply('Erro ao remover compra.');
    }

    try {
      await ctx.answerCbQuery();
    } catch (e) {}
  }

  @Action(/^list_card:(.+)$/)
  async onListCardSelect(@Ctx() ctx: Context) {
    // @ts-ignore
    const cardId = ctx.match[1];
    const month = this.saoPauloNowMonthKey();

    try {
      const compras = await this.comprasService.findByCardAndMonth(
        cardId,
        month,
      );

      let cardName = cardId;
      // Try to find card name if it's a UUID
      if (
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          cardId,
        )
      ) {
        const card = await this.cartoesService.findOne(cardId);
        if (card) cardName = card.nome;
      }

      if (compras.length === 0) {
        await ctx.reply(
          `Nenhuma fatura encontrada para ${cardName} em ${month}.`,
        );
      } else {
        let msg = `📄 Fatura ${month} (${cardName}):\nData | Desc | Valor | Nome\n--------------------------\n`;
        let total = 0;
        for (const c of compras) {
          const valor = Number(c.valorParcela);
          total += valor;
          const date = this.formatCompraDate(c.dataCompra);
          msg += `${date} | ${c.descricao} | R$${valor.toFixed(2)} | ${c.nome}\n`;
        }
        msg += `--------------------------\n💰 Total: R$ ${total.toFixed(2)}`;
        await ctx.reply(msg);
      }

      try {
        await ctx.answerCbQuery();
      } catch (e) {}
    } catch (e) {
      console.error(e);
      await ctx.reply('Erro ao buscar fatura.');
    }
  }

  @Action(/^card:(.+)$/)
  async onCardSelect(@Ctx() ctx: Context) {
    // @ts-ignore
    const cardId = ctx.match[1];
    if (ctx.chat?.id) {
      const state = this.userStates.get(ctx.chat.id);
      if (state && state.type === 'PURCHASE') {
        if (cardId === 'DINHEIRO' || cardId === 'PIX') {
          state.data.tipo = cardId;
          state.data.cartaoId = null;
        } else {
          state.data.cartaoId = cardId;
          state.data.tipo = 'CREDITO';
        }

        state.step = 'VALUE';
        await ctx.reply('Qual o valor? (Ex: 150.00)');
        try {
          await ctx.answerCbQuery();
        } catch (e) {}
      }
    }
  }

  @Action(/^pdf_month:(.+)$/)
  async onPdfMonthSelect(@Ctx() ctx: Context) {
    // @ts-ignore
    const selection = ctx.match[1];
    if (!ctx.chat?.id) return;
    const state = this.userStates.get(ctx.chat.id);
    if (!state || state.type !== 'PDF') return;

    if (selection === 'OTHER') {
      state.step = 'MONTH_INPUT';
      await ctx.reply('Digite o mês no formato MM/AAAA (ex: 05/2024):');
    } else {
      // Convert MM/yyyy to yyyy-MM for internal use
      const [m, y] = selection.split('/');
      state.data.month = `${y}-${m}`;
      state.step = 'CARD';
      await this.askPdfCard(ctx);
    }
    try {
      await ctx.answerCbQuery();
    } catch (e) {}
  }

  @Action(/^pdf_card:(.+)$/)
  async onPdfCardSelect(@Ctx() ctx: Context) {
    // @ts-ignore
    const selection = ctx.match[1];
    if (!ctx.chat?.id) return;
    const state = this.userStates.get(ctx.chat.id);
    if (!state || state.type !== 'PDF') return;

    state.data.cardFilter = selection; // 'ALL', 'DINHEIRO', 'PIX', or cardUUID

    await ctx.reply('Gerando PDF... aguarde.');
    await this.generateAndSendPdf(ctx, state.data);
    this.userStates.delete(ctx.chat.id);
    try {
      await ctx.answerCbQuery();
    } catch (e) {}
  }

  async askPdfCard(ctx: Context) {
    const cartoes = await this.cartoesService.findAll();
    const buttons = [Markup.button.callback('Todos', 'pdf_card:ALL')];

    cartoes.forEach((c) =>
      buttons.push(Markup.button.callback(c.nome, `pdf_card:${c.id}`)),
    );
    buttons.push(
      Markup.button.callback('Apenas Dinheiro', 'pdf_card:DINHEIRO'),
    );
    buttons.push(Markup.button.callback('Apenas Pix', 'pdf_card:PIX'));

    await ctx.reply(
      'Selecione o cartão ou tipo:',
      Markup.inlineKeyboard(buttons, { columns: 2 }),
    );
  }

  async generateAndSendPdf(ctx: Context, data: any) {
    try {
      let compras = await this.comprasService.findByMonth(data.month);

      // Filter in memory because queryBuilder was in service but findByMonth is simpler
      if (data.cardFilter !== 'ALL') {
        if (data.cardFilter === 'DINHEIRO') {
          compras = compras.filter((c) => c.tipo === 'DINHEIRO');
        } else if (data.cardFilter === 'PIX') {
          compras = compras.filter((c) => c.tipo === 'PIX');
        } else {
          compras = compras.filter((c) => c.cartao?.id === data.cardFilter);
        }
      }

      if (compras.length === 0) {
        await ctx.reply(
          'Nenhuma compra encontrada para os filtros selecionados.',
        );
        return;
      }

      const pdfBuffer = await this.pdfService.generateInvoicePdf(
        compras,
        data.month,
      );

      await ctx.replyWithDocument(
        {
          source: pdfBuffer,
          filename: `Fatura_${data.month}.pdf`,
        },
        { caption: `Relatório de ${data.month}` },
      );
    } catch (e) {
      console.error(e);
      await ctx.reply('Erro ao gerar PDF.');
    }
  }

  @On('text')
  async onText(@Ctx() ctx: Context) {
    if (!ctx.chat?.id) return;
    const state = this.userStates.get(ctx.chat.id);
    if (!state) return;

    // @ts-ignore
    const text = ctx.message.text;

    if (state.type === 'PURCHASE') {
      await this.handlePurchaseWizard(ctx, state, text);
    } else if (state.type === 'CARD') {
      await this.handleCardWizard(ctx, state, text);
    } else if (state.type === 'PDF') {
      if (state.step === 'MONTH_INPUT') {
        if (text.match(/^\d{2}\/\d{4}$/)) {
          const [m, y] = text.split('/');
          state.data.month = `${y}-${m}`;
          state.step = 'CARD';
          await this.askPdfCard(ctx);
        } else {
          await ctx.reply('Formato inválido. Use MM/AAAA (ex: 05/2024).');
        }
      }
    } else if (state.type === 'EDIT') {
      await this.handleEditWizard(ctx, state, text);
    } else if (state.type === 'EDIT_SELECT' || state.type === 'CANCEL_SELECT') {
      await this.handleEditCancelSelectWizard(ctx, state, text);
    }
  }

  // --- WIZARD HANDLERS ---

  private truncateText(text: string, maxLength: number) {
    const t = (text || '').trim();
    if (t.length <= maxLength) return t;
    return `${t.slice(0, Math.max(0, maxLength - 1))}…`;
  }

  private getSaoPauloParts(date: Date) {
    const dtf = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Sao_Paulo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
    const parts = dtf.formatToParts(date);
    const map: Record<string, string> = {};
    for (const p of parts) {
      if (p.type !== 'literal') map[p.type] = p.value;
    }
    return map as {
      year: string;
      month: string;
      day: string;
      hour: string;
      minute: string;
      second: string;
    };
  }

  private saoPauloNowMonthKey() {
    const p = this.getSaoPauloParts(new Date());
    return `${p.year}-${p.month}`;
  }

  private saoPauloNowDateKey() {
    const p = this.getSaoPauloParts(new Date());
    return `${p.year}-${p.month}-${p.day}`;
  }

  private saoPauloNowYear() {
    const p = this.getSaoPauloParts(new Date());
    return Number(p.year);
  }

  private monthKeyToDisplay(monthKey: string) {
    const [y, m] = monthKey.split('-');
    return `${m}/${y}`;
  }

  private shiftMonthKey(monthKey: string, delta: number) {
    const [y, m] = monthKey.split('-').map((v) => Number(v));
    const total = y * 12 + (m - 1) + delta;
    const newY = Math.floor(total / 12);
    const newM = (total % 12) + 1;
    return `${newY}-${String(newM).padStart(2, '0')}`;
  }

  private formatCompraDate(value: unknown) {
    if (!value) return '';
    if (typeof value === 'string') {
      const s = value.slice(0, 10);
      if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
        const [, m, d] = s.split('-');
        return `${d}/${m}`;
      }
      return value;
    }
    if (value instanceof Date) {
      const p = this.getSaoPauloParts(value);
      return `${p.day}/${p.month}`;
    }
    return String(value);
  }

  private parseUserDate(text: string): string | null {
    const input = (text || '').trim().toLowerCase();
    if (!input) return null;
    if (input === 'hoje') return this.saoPauloNowDateKey();

    const parts = input.split(/[\/\-]/).filter(Boolean);
    if (parts.length < 2) return null;

    const day = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10);
    const year =
      parts.length >= 3 ? parseInt(parts[2], 10) : this.saoPauloNowYear();

    if (
      Number.isNaN(day) ||
      Number.isNaN(month) ||
      Number.isNaN(year) ||
      month < 1 ||
      month > 12 ||
      day < 1 ||
      day > 31
    ) {
      return null;
    }

    const d = new Date(year, month - 1, day);
    if (
      d.getFullYear() !== year ||
      d.getMonth() !== month - 1 ||
      d.getDate() !== day
    ) {
      return null;
    }

    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  async handleEditCancelSelectWizard(
    ctx: Context,
    state: WizardState,
    text: string,
  ) {
    if (!ctx.chat?.id) return;
    if (state.step !== 'DATE') return;

    const dateKey = this.parseUserDate(text);
    if (!dateKey) {
      await ctx.reply("Data inválida. Use DD/MM, DD/MM/AAAA ou 'hoje'.");
      return;
    }

    const compras = await this.comprasService.findByPurchaseDate(dateKey);
    if (compras.length === 0) {
      this.userStates.delete(ctx.chat.id);
      await ctx.reply('Nenhuma compra encontrada nesta data.');
      return;
    }

    const prefix = state.type === 'EDIT_SELECT' ? 'edit_pick' : 'cancel_pick';

    const buttons = compras.slice(0, 40).map((c) => {
      const valor = Number(c.valorParcela);
      const dataStr = this.formatCompraDate(c.dataCompra);
      const desc = this.truncateText(c.descricao || '', 22);
      const nome = this.truncateText(c.nome || '', 14);
      const parcelaStr = c.parcelas ? `${c.parcelaAtual}/${c.parcelas}` : '';
      const card = c.cartao ? c.cartao.nome : c.tipo;
      const cardStr = this.truncateText(String(card || ''), 10);
      const label =
        `${dataStr} ${desc} ${parcelaStr} R$${valor.toFixed(2)} ${nome} [${cardStr}]`.trim();
      return Markup.button.callback(label, `${prefix}:${c.id}`);
    });

    this.userStates.delete(ctx.chat.id);
    await ctx.reply(
      state.type === 'EDIT_SELECT'
        ? 'Selecione a compra para editar:'
        : 'Selecione a compra para remover:',
      Markup.inlineKeyboard(buttons, { columns: 1 }),
    );
  }

  async handleEditWizard(ctx: Context, state: WizardState, text: string) {
    switch (state.step) {
      case 'VALUE':
        if (text.toLowerCase() !== 'manter') {
          const valor = parseFloat(text.replace(',', '.'));
          if (isNaN(valor))
            return ctx.reply('Valor inválido. Use . ou , para decimais.');
          state.data.updates.valor = valor;
        }
        state.step = 'DESC';
        await ctx.reply(
          `Nova DESCRIÇÃO (Atual: ${state.data.original.descricao}) ou 'manter':`,
        );
        break;
      case 'DESC':
        if (text.toLowerCase() !== 'manter') {
          state.data.updates.descricao = text;
        }
        state.step = 'NAME';
        await ctx.reply(
          `Novo NOME (Atual: ${state.data.original.nome}) ou 'manter':`,
        );
        break;
      case 'NAME':
        if (text.toLowerCase() !== 'manter') {
          state.data.updates.nome = text;
        }

        // Finish
        try {
          if (Object.keys(state.data.updates).length > 0) {
            const updated = await this.comprasService.update(
              state.data.id,
              state.data.updates,
            );

            const valorTotal = Number(updated.valor);
            const valorParcela = Number(updated.valorParcela);
            const dataStr = this.formatCompraDate(updated.dataCompra);
            const parcelaStr = updated.parcelas
              ? `${updated.parcelaAtual}/${updated.parcelas}`
              : '';
            const forma = updated.cartao ? updated.cartao.nome : updated.tipo;

            await ctx.reply(
              '✅ Compra atualizada!\n' +
                `📅 ${dataStr}\n` +
                `🛒 ${updated.descricao}\n` +
                `👤 ${updated.nome}\n` +
                `💳 ${forma}\n` +
                `💰 Total: R$ ${valorTotal.toFixed(2)}\n` +
                `${parcelaStr ? `📦 Parcela ${parcelaStr}: R$ ${valorParcela.toFixed(2)}` : ''}`,
            );
          } else {
            await ctx.reply('ℹ️ Nenhuma alteração realizada.');
          }
        } catch (e) {
          await ctx.reply(`Erro ao atualizar: ${e.message}`);
        }
        this.userStates.delete(ctx.chat!.id);
        break;
    }
  }

  async handleCardWizard(ctx: Context, state: WizardState, text: string) {
    switch (state.step) {
      case 'NAME':
        state.data.nome = text;
        state.step = 'TYPE';
        await ctx.reply('Qual o tipo? (Responda "cartao" ou "pix")');
        break;
      case 'TYPE':
        const tipo = text.toLowerCase().includes('pix') ? 'pix' : 'cartao';
        state.data.tipo = tipo;
        if (tipo === 'cartao') {
          state.step = 'CLOSE_DAY';
          await ctx.reply('Qual o dia de fechamento da fatura? (1-31)');
        } else {
          state.step = 'LIMIT';
          await ctx.reply('Qual o limite mensal? (Digite 0 se não houver)');
        }
        break;
      case 'CLOSE_DAY':
        const day = parseInt(text);
        if (isNaN(day) || day < 1 || day > 31) {
          return ctx.reply('Dia inválido. Digite um número entre 1 e 31.');
        }
        state.data.dataFechamento = day;
        state.step = 'LIMIT';
        await ctx.reply('Qual o limite do cartão? (Ex: 5000)');
        break;
      case 'LIMIT':
        const limit = parseFloat(text.replace(',', '.'));
        state.data.limite = isNaN(limit) ? 0 : limit;

        // Finish
        try {
          await this.cartoesService.create(state.data);
          await ctx.reply(
            `✅ Cartão ${state.data.nome} cadastrado com sucesso!`,
          );
          this.userStates.delete(ctx.chat!.id);
        } catch (e) {
          await ctx.reply(`Erro ao criar cartão: ${e.message}`);
        }
        break;
    }
  }

  async handlePurchaseWizard(ctx: Context, state: WizardState, text: string) {
    switch (state.step) {
      case 'VALUE':
        const valor = parseFloat(text.replace(',', '.'));
        if (isNaN(valor))
          return ctx.reply('Valor inválido. Tente novamente (ex: 150.50)');
        state.data.valor = valor;
        state.step = 'DATE';
        await ctx.reply("Qual a data? (DD/MM ou 'hoje')");
        break;

      case 'DATE':
        const dateKey = this.parseUserDate(text);
        if (!dateKey) {
          return ctx.reply("Data inválida. Use DD/MM, DD/MM/AAAA ou 'hoje'.");
        }
        state.data.dataCompra = dateKey;
        state.step = 'TIME';
        await ctx.reply("Horário? (HH:MM ou 'pular')");
        break;

      case 'TIME':
        if (text.toLowerCase() !== 'pular') {
          state.data.horaCompra = text;
        }
        state.step = 'DESC';
        await ctx.reply('Descrição?');
        break;

      case 'DESC':
        state.data.descricao = text;

        if (state.data.tipo === 'DINHEIRO' || state.data.tipo === 'PIX') {
          state.data.parcelas = 1;
          state.step = 'NAME';
          await ctx.reply('Nome de quem comprou?');
        } else {
          state.step = 'PARCELAS';
          await ctx.reply('Quantas parcelas?');
        }
        break;

      case 'PARCELAS':
        const parcelas = parseInt(text);
        state.data.parcelas = isNaN(parcelas) ? 1 : parcelas;
        state.step = 'NAME';
        await ctx.reply('Nome de quem comprou?');
        break;

      case 'NAME':
        state.data.nome = text;
        // Finish
        try {
          // Check limit logic here ONLY if it's a CREDIT CARD
          if (state.data.cartaoId) {
            const cartao = await this.cartoesService.findOne(
              state.data.cartaoId,
            );
            if (cartao && cartao.limite && cartao.limite > 0) {
              // Calculate current usage
              const monthStr = this.saoPauloNowMonthKey();
              const comprasMes =
                await this.comprasService.findByMonth(monthStr);
              const gastosCartao = comprasMes
                .filter((c) => c.cartao?.id === cartao.id)
                .reduce((acc, c) => acc + Number(c.valorParcela), 0);

              const novoGasto =
                Number(state.data.valor) / Number(state.data.parcelas); // Aproximação do impacto na fatura atual

              if (gastosCartao + novoGasto > cartao.limite) {
                await ctx.reply(
                  `⚠️ ATENÇÃO: Essa compra vai exceder o limite do cartão!\nLimite: ${cartao.limite}\nGasto Atual: ${gastosCartao}\nNovo Total: ${gastosCartao + novoGasto}`,
                );
              }
            }
          }

          await this.comprasService.create(state.data);
          const total = state.data.valor;
          const parc = state.data.parcelas;
          const desc = state.data.descricao;
          const dataStr = this.formatCompraDate(state.data.dataCompra);
          const typeStr =
            state.data.tipo === 'PIX'
              ? 'Pix'
              : state.data.tipo === 'DINHEIRO'
                ? 'Dinheiro'
                : 'Cartão';

          await ctx.reply(
            `✅ Compra registrada!\n🛒 ${desc} — R$ ${total.toFixed(2)} (${parc}x)\n📅 ${dataStr} (${typeStr})`,
          );
          this.userStates.delete(ctx.chat!.id);
        } catch (e) {
          console.error(e);
          await ctx.reply(`Erro ao salvar compra: ${e.message}`);
        }
        break;
    }
  }

  // --- CRON JOBS ---

  @Cron(CronExpression.EVERY_DAY_AT_9AM, { timeZone: 'America/Sao_Paulo' })
  async checkAlerts() {
    this.logger.log('Checking closing dates for alerts...');
    const cartoes = await this.cartoesService.findAll();
    const nowParts = this.getSaoPauloParts(new Date());
    const today = new Date(
      Number(nowParts.year),
      Number(nowParts.month) - 1,
      Number(nowParts.day),
      12,
      0,
      0,
    );

    for (const cartao of cartoes) {
      if (!cartao.dataFechamento || !cartao.chatId) continue;

      // Check if closing date is in 3 days
      // Need to construct date for current month
      let closingDate = new Date(
        today.getFullYear(),
        today.getMonth(),
        cartao.dataFechamento,
        12,
        0,
        0,
      );

      // If closing date is in the past (relative to now), move to next month
      if (closingDate.getTime() < today.getTime()) {
        closingDate = addMonths(closingDate, 1);
      }

      const diffTime = closingDate.getTime() - today.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      if (diffDays === 3) {
        try {
          await this.bot.telegram.sendMessage(
            cartao.chatId,
            `⚠️ Alerta: A fatura do cartão ${cartao.nome} fecha em 3 dias (dia ${cartao.dataFechamento})!`,
          );
        } catch (e) {
          this.logger.error(`Failed to send alert for card ${cartao.id}`, e);
        }
      }
    }
  }
}
