// Página de relatórios: busca os números já calculados em /api/relatorios e desenha os gráficos
const RELATORIOS_URL = '/api/relatorios';
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const MESES_EXTENSO = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const NOMES_UF = {
    AC: 'Acre', AL: 'Alagoas', AP: 'Amapá', AM: 'Amazonas', BA: 'Bahia', CE: 'Ceará', DF: 'Distrito Federal',
    ES: 'Espírito Santo', GO: 'Goiás', MA: 'Maranhão', MT: 'Mato Grosso', MS: 'Mato Grosso do Sul',
    MG: 'Minas Gerais', PA: 'Pará', PB: 'Paraíba', PR: 'Paraná', PE: 'Pernambuco', PI: 'Piauí',
    RJ: 'Rio de Janeiro', RN: 'Rio Grande do Norte', RS: 'Rio Grande do Sul', RO: 'Rondônia',
    RR: 'Roraima', SC: 'Santa Catarina', SP: 'São Paulo', SE: 'Sergipe', TO: 'Tocantins'
};

const estado = {
    ano: getAnoAtual(),
    uf: '',
    relatorio: null,
    metricaMes: 'total',
    controller: null,
    historicoId: 0
};

let seletorAno;

document.addEventListener('DOMContentLoaded', () => {
    const params = new URLSearchParams(window.location.search);
    estado.ano = anoDaURL(params);
    estado.uf = NOMES_UF[params.get('uf')] ? params.get('uf') : '';

    seletorAno = criarSeletorAno($('yearChips'), $('anoOutro'), (ano) => {
        estado.ano = ano;
        carregar();
    });
    seletorAno.marcar(estado.ano);

    const ufSelect = $('uf');
    ufSelect.insertAdjacentHTML('beforeend', Object.entries(NOMES_UF)
        .sort((a, b) => a[1].localeCompare(b[1], 'pt-BR'))
        .map(([uf, nome]) => `<option value="${uf}">${nome}</option>`).join(''));
    ufSelect.value = estado.uf;
    ufSelect.addEventListener('change', () => {
        estado.uf = ufSelect.value;
        carregar();
    });

    $('mesMetric').addEventListener('click', (event) => {
        const botao = event.target.closest('.seg-btn');
        if (!botao) return;
        estado.metricaMes = botao.dataset.metric;
        $('mesMetric').querySelectorAll('.seg-btn').forEach(b => {
            b.classList.toggle('active', b === botao);
            b.setAttribute('aria-checked', b === botao);
        });
        renderMes();
    });

    $('retryButton').addEventListener('click', carregar);
    setupTooltip();
    carregar();
});

// ===== Carregamento =====
async function carregar() {
    atualizarURL();
    if (estado.controller) estado.controller.abort();
    estado.controller = new AbortController();

    $('loadingState').classList.remove('hidden');
    $('errorState').classList.add('hidden');
    $('report').classList.add('is-loading');

    try {
        const url = new URL(RELATORIOS_URL, window.location.origin);
        url.searchParams.set('ano', estado.ano);
        if (estado.uf) url.searchParams.set('uf', estado.uf);

        const response = await fetch(url, { signal: estado.controller.signal });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.message || `Erro ${response.status} ao gerar o relatório.`);

        estado.relatorio = data;
        renderRelatorio();
        carregarHistorico();
    } catch (error) {
        if (error.name === 'AbortError') return;
        console.error('Erro ao carregar relatório:', error);
        $('report').classList.add('hidden');
        $('errorMessage').textContent = error.message;
        $('errorState').classList.remove('hidden');
    } finally {
        $('loadingState').classList.add('hidden');
        $('report').classList.remove('is-loading');
    }
}

function atualizarURL() {
    const params = new URLSearchParams();
    params.set('ano', estado.ano);
    if (estado.uf) params.set('uf', estado.uf);
    history.replaceState(null, '', `${window.location.pathname}?${params}`);
}

// Histórico: um pedido curto por ano, dois de cada vez, desenhando conforme chegam
async function carregarHistorico() {
    const id = ++estado.historicoId;
    const atual = getAnoAtual();
    const anos = [];
    for (let ano = PRIMEIRO_ANO; ano <= atual; ano++) anos.push(ano);

    const valores = new Map();
    const desenhar = () => renderHistorico(anos, valores, atual);
    desenhar();

    const fila = anos.slice().reverse();
    const trabalhar = async () => {
        while (fila.length && id === estado.historicoId) {
            const ano = fila.shift();
            try {
                const url = new URL(RELATORIOS_URL, window.location.origin);
                url.searchParams.set('ano', ano);
                url.searchParams.set('resumo', '1');
                if (estado.uf) url.searchParams.set('uf', estado.uf);
                const response = await fetch(url);
                const data = await response.json();
                if (!response.ok) throw new Error(data.message);
                valores.set(ano, data);
            } catch (error) {
                console.error(`Erro no histórico de ${ano}:`, error);
                valores.set(ano, { erro: true });
            }
            if (id === estado.historicoId) desenhar();
        }
    };
    await Promise.all([trabalhar(), trabalhar()]);
}

// ===== Renderização =====
function renderRelatorio() {
    const r = estado.relatorio;
    $('report').classList.remove('hidden');
    $('sourceNotice').classList.toggle('hidden', r.fonte !== 'exportacao');

    const onde = r.uf ? ` válidas em ${NOMES_UF[r.uf]}` : '';
    $('figures').innerHTML = [
        figura('Promoções', formatNumber(r.total), `iniciadas em ${r.ano}${onde}`),
        figura('Valor em prêmios', formatCompactCurrency(r.valorTotal), 'soma de todas as promoções'),
        figura('Valor mediano', formatCompactCurrency(r.mediana), 'metade das promoções fica abaixo'),
        figura('Prêmios a distribuir', formatCompactNumber(r.quantidadePremios), 'unidades, incluindo brindes'),
        figura('Empresas', formatNumber(r.empresas), 'mandatários diferentes'),
        figura('Em andamento hoje', formatNumber(r.emAndamento), 'com participação aberta')
    ].join('');

    renderMes();

    renderBarras($('chartModalidade'), r.porModalidade.map(m => ({
        label: formatModalidade(m.modalidade),
        value: m.total,
        display: formatNumber(m.total),
        sub: formatCompactCurrency(m.valor),
        tip: [formatModalidade(m.modalidade), `${formatNumber(m.total)} promoções (${percentual(m.total, r.total)})`, `${formatCurrency(m.valor)} em prêmios`]
    })));

    renderBarras($('chartSituacao'), r.porSituacao.map(s => {
        const situacao = getSituacao(s.situacao);
        return {
            label: situacao.label,
            dot: situacao.cor,
            value: s.total,
            display: formatNumber(s.total),
            sub: percentual(s.total, r.total),
            tip: [situacao.label, `${formatNumber(s.total)} promoções (${percentual(s.total, r.total)})`]
        };
    }));

    renderBarras($('chartTipos'), r.tiposPremio.map(t => ({
        label: t.tipo,
        value: t.promocoes,
        display: formatNumber(t.promocoes),
        sub: formatCompactCurrency(t.valor),
        tip: [t.tipo, `${formatNumber(t.promocoes)} promoções (${percentual(t.promocoes, r.total)})`, `${formatCurrency(t.valor)} em prêmios deste tipo`]
    })), { colunas: true });

    renderBarras($('chartFaixas'), r.faixasValor.map(f => ({
        label: f.faixa,
        value: f.total,
        display: formatNumber(f.total),
        sub: percentual(f.total, r.total),
        tip: [f.faixa, `${formatNumber(f.total)} promoções (${percentual(f.total, r.total)})`]
    })));

    renderUF();
    renderMaiores();

    renderBarras($('chartEmpresas'), r.topEmpresas.map(e => ({
        label: toTitleCase(e.nome),
        value: e.total,
        display: formatNumber(e.total),
        sub: formatCompactCurrency(e.valor),
        tip: [toTitleCase(e.nome), `CNPJ ${formatCNPJDisplay(e.cnpj)}`, `${formatNumber(e.total)} promoções · ${formatCurrency(e.valor)}`]
    })));

    renderBarras($('chartEmpresasValor'), r.topEmpresasValor.map(e => ({
        label: toTitleCase(e.nome),
        value: e.valor,
        display: formatCompactCurrency(e.valor),
        sub: `${formatNumber(e.total)} ${e.total === 1 ? 'promoção' : 'promoções'}`,
        tip: [toTitleCase(e.nome), `CNPJ ${formatCNPJDisplay(e.cnpj)}`, `${formatCurrency(e.valor)} em ${formatNumber(e.total)} promoções`]
    })));

    $('reportFoot').textContent = `Dados consultados em ${formatDateTime(r.timestamp)}. Promoções contadas pelo ano da data de início.`;
}

function figura(rotulo, valor, nota) {
    return `
        <div class="figure">
            <dt>${escapeHTML(rotulo)}</dt>
            <dd>
                <span class="figure-value">${escapeHTML(valor)}</span>
                <span class="figure-note">${escapeHTML(nota)}</span>
            </dd>
        </div>
    `;
}

function renderMes() {
    const r = estado.relatorio;
    if (!r) return;
    const porValor = estado.metricaMes === 'valor';
    const formatar = porValor ? formatCompactCurrency : formatNumber;

    const itens = r.porMes.map(m => ({
        label: MESES[m.mes],
        value: porValor ? m.valor : m.total,
        tip: [`${MESES_EXTENSO[m.mes]} de ${r.ano}`, `${formatNumber(m.total)} promoções`, `${formatCurrency(m.valor)} em prêmios`]
    }));

    const pico = r.porMes.reduce((a, b) => ((porValor ? b.valor : b.total) > (porValor ? a.valor : a.total) ? b : a));
    $('mesSub').textContent = `Pico em ${MESES_EXTENSO[pico.mes]}, com ${porValor ? formatCurrency(pico.valor) : `${formatNumber(pico.total)} promoções`}`;

    renderColunas($('chartMes'), itens, {
        formatar,
        descricao: `Promoções iniciadas por mês em ${r.ano}, ${porValor ? 'em valor de prêmios' : 'em quantidade'}`
    });

    $('tableMes').innerHTML = tabela(
        ['Mês', 'Promoções', 'Valor em prêmios'],
        r.porMes.map(m => [MESES_EXTENSO[m.mes], formatNumber(m.total), formatCurrency(m.valor)]),
        [false, true, true]
    );
}

function renderUF() {
    const r = estado.relatorio;
    $('panelUF').classList.toggle('hidden', Boolean(r.uf));
    if (r.uf) return;

    $('legendUF').innerHTML = `
        <span class="legend-item"><span class="swatch swatch-1"></span>Regionais (só alguns estados)</span>
        <span class="legend-item"><span class="swatch swatch-2"></span>Nacionais (${formatNumber(r.nacionais)})</span>
    `;

    const max = Math.max(...r.porUF.map(u => u.total));
    const ufs = r.porUF.slice().sort((a, b) => b.total - a.total);
    $('chartUF').innerHTML = `<ol class="hbars hbars-compact">${ufs.map(u => {
        const nacionais = u.total - u.regionais;
        const tip = [NOMES_UF[u.uf], `${formatNumber(u.total)} promoções válidas`, `${formatNumber(u.regionais)} regionais · ${formatNumber(nacionais)} nacionais`];
        return `
            <li class="hbar" tabindex="0" data-tip="${escapeHTML(JSON.stringify(tip))}">
                <div class="hbar-head">
                    <span class="hbar-label">${escapeHTML(NOMES_UF[u.uf])}</span>
                    <span class="hbar-value">${formatNumber(u.total)}</span>
                </div>
                <div class="hbar-track">
                    <span class="hbar-fill" style="width:${(u.regionais / max) * 100}%"></span><span class="hbar-fill hbar-fill-2" style="width:${(nacionais / max) * 100}%"></span>
                </div>
            </li>
        `;
    }).join('')}</ol>`;
}

function renderMaiores() {
    const r = estado.relatorio;
    if (r.maioresPromocoes.length === 0) {
        $('tableMaiores').innerHTML = '<p class="muted small">Sem promoções neste recorte.</p>';
        return;
    }

    $('tableMaiores').innerHTML = `
        <table class="table table-ranking">
            <thead>
                <tr><th class="num rank">#</th><th>Promoção</th><th>Modalidade</th><th class="num">Prêmios</th></tr>
            </thead>
            <tbody>
                ${r.maioresPromocoes.map((p, i) => {
                    const link = `/?ano=${r.ano}&numeroCertificado=${encodeURIComponent(p.numeroCA || '')}`;
                    return `
                        <tr>
                            <td class="num rank">${i + 1}</td>
                            <td>
                                <a class="ranking-name" href="${link}">${escapeHTML(p.nome || 'Sem nome')}</a>
                                <span class="ranking-sub">${escapeHTML(p.empresa || '')} · <span class="mono">${escapeHTML(p.numeroPromocao)}</span></span>
                            </td>
                            <td class="ranking-modalidade">${escapeHTML(formatModalidade(p.modalidade))}</td>
                            <td class="num">${formatCurrency(p.valor)}</td>
                        </tr>
                    `;
                }).join('')}
            </tbody>
        </table>
    `;
}

function renderHistorico(anos, valores, atual) {
    const carregados = anos.filter(ano => valores.has(ano) && !valores.get(ano).erro);
    const sub = $('historicoSub');
    const onde = estado.uf ? ` válidas em ${NOMES_UF[estado.uf]}` : '';
    sub.textContent = carregados.length < anos.length
        ? `Promoções iniciadas em cada ano${onde} · carregando ${carregados.length} de ${anos.length} anos…`
        : `Promoções iniciadas em cada ano${onde}. ${atual} ainda está em andamento; 2017 e 2018 têm poucos registros na base do SCPC.`;

    const itens = anos.map(ano => {
        const dado = valores.get(ano);
        const parcial = ano === atual;
        return {
            label: String(ano),
            value: dado && !dado.erro ? dado.total : null,
            destaque: ano === estado.ano,
            parcial,
            tip: dado && !dado.erro
                ? [`${ano}${parcial ? ' (até hoje)' : ''}`, `${formatNumber(dado.total)} promoções`, `${formatCurrency(dado.valorTotal)} em prêmios`]
                : [String(ano), dado ? 'Não foi possível carregar' : 'Carregando…']
        };
    });

    renderColunas($('chartHistorico'), itens, {
        formatar: formatNumber,
        descricao: 'Quantidade de promoções iniciadas em cada ano'
    });

    $('tableHistorico').innerHTML = tabela(
        ['Ano', 'Promoções', 'Valor em prêmios'],
        anos.filter(ano => valores.has(ano) && !valores.get(ano).erro).map(ano => {
            const dado = valores.get(ano);
            return [`${ano}${ano === atual ? ' (até hoje)' : ''}`, formatNumber(dado.total), formatCurrency(dado.valorTotal)];
        }),
        [false, true, true]
    );
}

// ===== Componentes de gráfico =====

// Colunas verticais com grade leve; só a maior coluna recebe rótulo direto
function renderColunas(el, itens, { formatar, descricao }) {
    const valores = itens.map(i => i.value).filter(v => v !== null);
    const topo = escalaBonita(Math.max(0, ...valores));
    const indiceMax = itens.findIndex(i => i.value !== null && i.value === Math.max(...valores));

    el.innerHTML = `
        <div class="cchart" role="img" aria-label="${escapeHTML(descricao)}">
            <div class="cchart-plot">
                <div class="cchart-grid" aria-hidden="true">
                    <span style="bottom:100%"><em>${escapeHTML(formatar(topo))}</em></span>
                    <span style="bottom:50%"><em>${escapeHTML(formatar(topo / 2))}</em></span>
                    <span style="bottom:0"><em>0</em></span>
                </div>
                <div class="cchart-bars">
                    ${itens.map((item, i) => {
                        const altura = item.value === null || topo === 0 ? 0 : (item.value / topo) * 100;
                        const classes = ['cbar'];
                        if (item.value === null) classes.push('cbar-empty');
                        if (item.parcial) classes.push('cbar-partial');
                        if (item.destaque) classes.push('cbar-current');
                        return `
                            <div class="${classes.join(' ')}" tabindex="0" data-tip="${escapeHTML(JSON.stringify(item.tip))}">
                                <span class="cbar-fill" style="height:${altura}%">
                                    ${i === indiceMax && valores.length > 1 ? `<span class="cbar-label">${escapeHTML(formatar(item.value))}</span>` : ''}
                                </span>
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>
            <div class="cchart-x" aria-hidden="true">
                ${itens.map(item => `<span class="${item.destaque ? 'is-current' : ''}">${escapeHTML(item.label)}${item.parcial ? '*' : ''}</span>`).join('')}
            </div>
        </div>
    `;
}

// Barras horizontais: rótulo e valor em cima, barra embaixo
function renderBarras(el, itens, { colunas = false } = {}) {
    if (itens.length === 0) {
        el.innerHTML = '<p class="muted small">Sem dados neste recorte.</p>';
        return;
    }
    const max = Math.max(...itens.map(i => i.value)) || 1;
    el.innerHTML = `<ol class="hbars${colunas ? ' hbars-cols' : ''}">${itens.map(item => `
        <li class="hbar" tabindex="0" data-tip="${escapeHTML(JSON.stringify(item.tip))}">
            <div class="hbar-head">
                <span class="hbar-label">${item.dot ? `<span class="status ${item.dot}"></span>` : ''}${escapeHTML(item.label)}</span>
                <span class="hbar-value">${escapeHTML(item.display)}${item.sub ? `<span class="hbar-sub">${escapeHTML(item.sub)}</span>` : ''}</span>
            </div>
            <div class="hbar-track"><span class="hbar-fill" style="width:${(item.value / max) * 100}%"></span></div>
        </li>
    `).join('')}</ol>`;
}

function tabela(cabecalho, linhas, numericas) {
    return `
        <table class="table">
            <thead><tr>${cabecalho.map((c, i) => `<th class="${numericas[i] ? 'num' : ''}">${escapeHTML(c)}</th>`).join('')}</tr></thead>
            <tbody>${linhas.map(linha => `<tr>${linha.map((c, i) => `<td class="${numericas[i] ? 'num' : ''}">${escapeHTML(c)}</td>`).join('')}</tr>`).join('')}</tbody>
        </table>
    `;
}

// Arredonda o topo do eixo para 1, 2, 2,5 ou 5 × potência de 10
function escalaBonita(valor) {
    if (valor <= 0) return 0;
    const potencia = Math.pow(10, Math.floor(Math.log10(valor)));
    const passo = [1, 2, 2.5, 5, 10].find(p => p * potencia >= valor);
    return passo * potencia;
}

// ===== Tooltip =====
function setupTooltip() {
    const tooltip = $('chartTooltip');
    let alvoAtual = null;

    const mostrar = (alvo, x, y) => {
        const linhas = JSON.parse(alvo.dataset.tip);
        tooltip.innerHTML = linhas.map((linha, i) => i === 0 ? `<strong>${escapeHTML(linha)}</strong>` : `<span>${escapeHTML(linha)}</span>`).join('');
        tooltip.hidden = false;
        const largura = tooltip.offsetWidth;
        const altura = tooltip.offsetHeight;
        const esquerda = Math.min(Math.max(8, x - largura / 2), window.innerWidth - largura - 8);
        const topo = y - altura - 12 < 8 ? y + 16 : y - altura - 12;
        tooltip.style.left = `${esquerda}px`;
        tooltip.style.top = `${topo}px`;
        alvoAtual = alvo;
    };

    const esconder = () => {
        tooltip.hidden = true;
        alvoAtual = null;
    };

    document.addEventListener('pointermove', (event) => {
        const alvo = event.target.closest('[data-tip]');
        if (!alvo) {
            if (alvoAtual) esconder();
            return;
        }
        mostrar(alvo, event.clientX, event.clientY);
    });

    document.addEventListener('focusin', (event) => {
        const alvo = event.target.closest('[data-tip]');
        if (!alvo) return;
        const caixa = alvo.getBoundingClientRect();
        mostrar(alvo, caixa.left + caixa.width / 2, caixa.top);
    });

    document.addEventListener('focusout', esconder);
    window.addEventListener('scroll', esconder, { passive: true });
}

// ===== Formatação específica =====
function percentual(parte, total) {
    if (!total) return '0%';
    return new Intl.NumberFormat('pt-BR', { style: 'percent', maximumFractionDigits: 1 }).format(parte / total);
}

function formatCompactNumber(valor) {
    return new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 }).format(valor);
}
