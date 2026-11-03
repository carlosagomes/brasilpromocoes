// Configuração da API
const API_BASE_URL = '/api/promocoes';
const PAGE_SIZE = 30;
const CONSULTA_OFICIAL_URL = 'https://scpc.seae.fazenda.gov.br/scpc/promocao_consulta_publica.jsf';

// Elementos do DOM (o helper $ está em comum.js)
const searchForm = $('searchForm');
const searchButton = $('searchButton');
const anoInput = $('anoPromocao');
const anoSelect = $('anoOutro');
const yearChips = $('yearChips');
const loadingState = $('loadingState');
const resultsSection = $('resultsSection');
const errorState = $('errorState');
const emptyState = $('emptyState');
const promocoesContainer = $('promocoesContainer');
const resultsCount = $('resultsCount');
const errorMessage = $('errorMessage');
const statsEl = $('stats');
const statusChipsEl = $('statusChips');
const refineInput = $('refineInput');
const sortSelect = $('sortSelect');
const loadMoreButton = $('loadMore');
const sourceNotice = $('sourceNotice');
const modal = $('promocaoModal');

// Estado da aplicação
let currentPromocoes = [];
let currentMetadata = null;
let visiblePromocoes = [];
let shownCount = 0;
let statusFilter = '';
let searchController = null;

// ===== Ano automático =====
let seletorAno;

function setupYears() {
    seletorAno = criarSeletorAno(yearChips, anoSelect, (ano) => {
        anoInput.value = String(ano);
        searchForm.requestSubmit();
    });
}

function setAno(ano) {
    anoInput.value = String(ano);
    seletorAno.marcar(ano);
}

// ===== Inicialização =====
document.addEventListener('DOMContentLoaded', function() {
    setupYears();
    restoreFromURL();

    searchForm.addEventListener('submit', handleSearch);
    $('clearFilters').addEventListener('click', clearFilters);
    $('retryButton').addEventListener('click', () => searchForm.requestSubmit());
    $('vigentes').addEventListener('change', () => searchForm.requestSubmit());
    loadMoreButton.addEventListener('click', renderNextPage);

    refineInput.addEventListener('input', debounce(applyLocalFilters, 150));
    sortSelect.addEventListener('change', applyLocalFilters);
    statusChipsEl.addEventListener('click', (event) => {
        const tab = event.target.closest('.tab');
        if (!tab) return;
        statusFilter = tab.dataset.status;
        applyLocalFilters();
    });

    promocoesContainer.addEventListener('click', (event) => {
        const row = event.target.closest('.row');
        if (row) showPromocaoDetails(currentPromocoes[Number(row.dataset.index)]);
    });

    $('toggleAdvanced').addEventListener('click', () => {
        setAdvancedOpen($('advancedFilters').classList.contains('hidden'));
    });

    // Máscara para CNPJ
    const cnpjInput = $('cnpjMandatario');
    cnpjInput.addEventListener('input', () => formatCNPJ(cnpjInput));

    $('modalClose').addEventListener('click', closeModal);
    modal.addEventListener('click', (event) => {
        if (event.target === modal) closeModal();
    });
    modal.addEventListener('close', () => { document.body.style.overflow = ''; });

    window.addEventListener('popstate', () => {
        restoreFromURL();
        searchForm.requestSubmit();
    });

    // Busca automática ao abrir o site
    searchForm.requestSubmit();
});

// ===== URL (permite compartilhar e voltar para uma busca) =====
const URL_FIELDS = ['nomePromocao', 'uf', 'modalidade', 'nomeMandatario', 'cnpjMandatario', 'numeroCertificado'];

function restoreFromURL() {
    const params = new URLSearchParams(window.location.search);
    setAno(anoDaURL(params));

    URL_FIELDS.forEach(field => { $(field).value = params.get(field) || ''; });
    if ($('cnpjMandatario').value) formatCNPJ($('cnpjMandatario'));
    $('vigentes').checked = params.get('vigentes') === '1';

    if (URL_FIELDS.slice(1).some(field => params.get(field))) {
        setAdvancedOpen(true);
    }
    updateFilterCount();
}

function setAdvancedOpen(aberto) {
    $('advancedFilters').classList.toggle('hidden', !aberto);
    $('toggleAdvanced').setAttribute('aria-expanded', aberto);
}

function updateURL(searchParams) {
    const params = new URLSearchParams();
    params.set('ano', searchParams.anoPromocao);
    URL_FIELDS.forEach(field => {
        if (searchParams[field]) params.set(field, field === 'cnpjMandatario' ? $(field).value : searchParams[field]);
    });
    if (searchParams.vigentes) params.set('vigentes', '1');

    const url = `${window.location.pathname}?${params}`;
    if (url !== window.location.pathname + window.location.search) {
        history.pushState(null, '', url);
    }
}

function updateFilterCount() {
    const count = URL_FIELDS.slice(1).filter(field => $(field).value.trim()).length;
    const badge = $('filterCount');
    badge.textContent = count;
    badge.classList.toggle('hidden', count === 0);
}

// ===== Busca =====
async function handleSearch(event) {
    event.preventDefault();

    const formData = new FormData(searchForm);
    const searchParams = {};

    for (const [key, value] of formData.entries()) {
        const trimmed = String(value).trim();
        if (trimmed === '') continue;
        searchParams[key] = key === 'cnpjMandatario' ? cleanCNPJ(trimmed) : trimmed;
    }

    if (!searchParams.anoPromocao) {
        showError('Por favor, selecione o ano da promoção.');
        return;
    }

    for (const [field, label] of [['nomePromocao', 'O nome da promoção'], ['nomeMandatario', 'O nome da empresa']]) {
        if (searchParams[field] && searchParams[field].length < 3) {
            showError(`${label} precisa ter pelo menos 3 letras.`);
            return;
        }
    }

    updateURL(searchParams);
    updateFilterCount();

    // Cancela uma busca anterior que ainda esteja em andamento
    if (searchController) searchController.abort();
    searchController = new AbortController();

    try {
        showLoading();
        const data = await fetchPromocoes(searchParams, searchController.signal);
        currentPromocoes = data.promocoes;
        currentMetadata = data.metadata;
        statusFilter = '';
        refineInput.value = '';
        displayResults();
    } catch (error) {
        if (error.name === 'AbortError') return;
        console.error('Erro na busca:', error);
        showError(error.message);
    } finally {
        searchButton.disabled = false;
    }
}

async function fetchPromocoes(params, signal) {
    const url = new URL(API_BASE_URL, window.location.origin);
    Object.keys(params).forEach(key => url.searchParams.append(key, params[key]));

    const response = await fetch(url, { headers: { 'Accept': 'application/json' }, signal });
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
        throw new Error(data.message || `Erro ${response.status} ao consultar promoções.`);
    }

    return {
        promocoes: Array.isArray(data.promocoes) ? data.promocoes : [],
        metadata: data.metadata || {}
    };
}

// ===== Resultados =====
function displayResults() {
    hideAllStates();

    if (currentPromocoes.length === 0) {
        emptyState.classList.remove('hidden');
        return;
    }

    resultsSection.classList.remove('hidden');
    sourceNotice.classList.toggle('hidden', currentMetadata.fonte !== 'exportacao');
    renderStats();
    applyLocalFilters();
}

function renderStats() {
    const agora = Date.now();
    const total = currentPromocoes.length;
    const emAndamento = currentPromocoes.filter(p => isEmAndamento(p, agora)).length;
    const valorTotal = currentPromocoes.reduce((soma, p) => soma + (Number(p.valorTotal) || 0), 0);
    const empresas = new Set(currentPromocoes.map(p => p.mandatario?.cnpj).filter(Boolean)).size;

    const ano = currentMetadata.ano;
    statsEl.innerHTML = `
        <p class="summary-main">
            <strong>${formatNumber(total)}</strong> ${total === 1 ? 'promoção' : 'promoções'}
            ${currentMetadata.vigentes ? `iniciadas ou vigentes em ${ano}` : `iniciadas em ${ano}`}
        </p>
        <span class="summary-item"><strong>${formatNumber(emAndamento)}</strong> em andamento hoje</span>
        <span class="summary-item"><strong>${formatCompactCurrency(valorTotal)}</strong> em prêmios</span>
        <span class="summary-item"><strong>${formatNumber(empresas)}</strong> empresas</span>
    `;
}

function renderStatusChips() {
    const counts = {};
    currentPromocoes.forEach(p => { counts[p.situacao] = (counts[p.situacao] || 0) + 1; });

    const ordenadas = Object.keys(counts).sort((a, b) => counts[b] - counts[a]);
    statusChipsEl.innerHTML = [
        `<button type="button" role="tab" class="tab ${statusFilter === '' ? 'active' : ''}" aria-selected="${statusFilter === ''}" data-status="">Todas <span class="count">${formatNumber(currentPromocoes.length)}</span></button>`,
        ...ordenadas.map(status => `
            <button type="button" role="tab" class="tab ${statusFilter === status ? 'active' : ''}" aria-selected="${statusFilter === status}" data-status="${escapeHTML(status)}">
                ${escapeHTML(getSituacao(status).label)} <span class="count">${formatNumber(counts[status])}</span>
            </button>
        `)
    ].join('');
}

// Filtro e ordenação no navegador, sem nova chamada à API
function applyLocalFilters() {
    renderStatusChips();

    const termo = normalize(refineInput.value);
    visiblePromocoes = currentPromocoes
        .map((promocao, index) => ({ promocao, index }))
        .filter(({ promocao }) => {
            if (statusFilter && promocao.situacao !== statusFilter) return false;
            if (!termo) return true;
            const texto = [
                promocao.nome, promocao.numeroPromocao, promocao.numeroCA, promocao.modalidade,
                promocao.mandatario?.nomeFantasia, promocao.mandatario?.razaoSocial,
                promocao.mandatario?.cidade, promocao.abrangencia
            ].join(' ');
            return normalize(texto).includes(termo);
        });

    const sorters = {
        recentes: (a, b) => String(b.promocao.numeroPromocao).localeCompare(String(a.promocao.numeroPromocao)),
        termina: (a, b) => terminaSort(a.promocao) - terminaSort(b.promocao),
        valor: (a, b) => (Number(b.promocao.valorTotal) || 0) - (Number(a.promocao.valorTotal) || 0),
        nome: (a, b) => String(a.promocao.nome || '').localeCompare(String(b.promocao.nome || ''), 'pt-BR')
    };
    visiblePromocoes.sort(sorters[sortSelect.value] || sorters.recentes);

    promocoesContainer.innerHTML = '';
    shownCount = 0;
    renderNextPage();
}

// Promoções em andamento primeiro, ordenadas pela data de fim mais próxima
function terminaSort(promocao) {
    const fim = new Date(promocao.dataFim).getTime() || Infinity;
    return fim >= Date.now() ? fim : Infinity;
}

function renderNextPage() {
    const fragment = document.createDocumentFragment();
    const next = visiblePromocoes.slice(shownCount, shownCount + PAGE_SIZE);
    next.forEach(({ promocao, index }) => fragment.appendChild(createPromocaoRow(promocao, index)));
    promocoesContainer.appendChild(fragment);
    shownCount += next.length;

    const total = visiblePromocoes.length;
    resultsCount.textContent = total === 0
        ? 'Nenhuma promoção corresponde ao filtro.'
        : `Exibindo ${formatNumber(shownCount)} de ${formatNumber(total)} promoções`;

    const restantes = total - shownCount;
    loadMoreButton.classList.toggle('hidden', restantes <= 0);
    loadMoreButton.textContent = `Carregar mais ${formatNumber(Math.min(PAGE_SIZE, restantes))}`;
}

function createPromocaoRow(promocao, index) {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'row';
    row.setAttribute('role', 'row');
    row.dataset.index = index;

    const situacao = getSituacao(promocao.situacao);
    const mandatario = promocao.mandatario || {};
    const empresa = mandatario.nomeFantasia || mandatario.razaoSocial || 'Empresa não informada';
    const local = [toTitleCase(mandatario.cidade), mandatario.uf].filter(Boolean).join('/');

    row.innerHTML = `
        <span class="row-numero" role="cell">${escapeHTML(promocao.numeroPromocao || 'N/A')}</span>
        <span class="row-main" role="cell">
            <span class="row-title">${escapeHTML(promocao.nome || 'Nome não informado')}</span>
            <span class="row-sub">${escapeHTML(empresa)}${local ? ` · ${escapeHTML(local)}` : ''}</span>
        </span>
        <span class="row-modalidade" role="cell">${escapeHTML(formatModalidade(promocao.modalidade))}</span>
        <span class="row-periodo" role="cell">${formatPeriodo(promocao.dataInicio, promocao.dataFim)}</span>
        <span class="row-valor" role="cell">${formatCurrency(promocao.valorTotal)}</span>
        <span class="status-col" role="cell">
            <span class="status ${situacao.cor}">${escapeHTML(situacao.label)}</span>
            ${isEmAndamento(promocao) ? '<span class="live">em andamento</span>' : ''}
        </span>
    `;

    return row;
}

// ===== Modal de detalhes =====
async function showPromocaoDetails(resumo) {
    if (!resumo) return;

    $('modalKicker').textContent = `Promoção nº ${resumo.numeroPromocao || 'N/A'} · Certificado ${resumo.numeroCA || 'N/A'}`;
    $('modalTitle').textContent = resumo.nome || 'Detalhes da promoção';
    fillModalContent(resumo, null);

    document.body.style.overflow = 'hidden';
    modal.showModal();

    // Apurações e prêmios vêm sob demanda para manter a listagem leve
    try {
        const ano = anoDe(resumo.dataInicio) || currentMetadata.ano;
        const url = new URL(`${API_BASE_URL}/detalhe`, window.location.origin);
        url.searchParams.set('ano', ano);
        url.searchParams.set('numero', resumo.numeroPromocao);
        const response = await fetch(url);
        const data = await response.json();
        if (!response.ok) throw new Error(data.message);
        if (modal.open && $('modalTitle').textContent === (resumo.nome || 'Detalhes da promoção')) {
            fillModalContent(data, 'ok');
        }
    } catch (error) {
        console.error('Erro ao carregar detalhes:', error);
        if (modal.open) fillModalContent(resumo, 'erro');
    }
}

function fillModalContent(promocao, estadoDetalhes) {
    const situacao = getSituacao(promocao.situacao);
    const mandatario = promocao.mandatario || {};

    let detalhesHTML = '';
    if (estadoDetalhes === null) {
        detalhesHTML = `<p class="loading-inline">Carregando prêmios e apurações…</p>`;
    } else if (estadoDetalhes === 'erro') {
        detalhesHTML = `<div class="notice">Não foi possível carregar os prêmios e as apurações agora.</div>`;
    } else {
        detalhesHTML = createModalPremiosInfo(promocao.apuracoes) + createModalApuracoesInfo(promocao.apuracoes);
    }

    $('modalBody').innerHTML = `
        <div class="drawer-meta">
            <span class="status ${situacao.cor}">${escapeHTML(situacao.label)}</span>
            <span>${escapeHTML(formatModalidade(promocao.modalidade))}</span>
            ${isEmAndamento(promocao) ? '<span>Em andamento</span>' : ''}
        </div>

        <div class="drawer-actions">
            <button type="button" class="btn btn-secondary" data-copy="${escapeHTML(promocao.numeroCA || '')}">Copiar certificado</button>
            <a class="btn btn-secondary" href="${CONSULTA_OFICIAL_URL}" target="_blank" rel="noopener">Regulamento na consulta oficial ↗</a>
        </div>

        <section class="section">
            <h3>Resumo</h3>
            <dl class="dl">
                ${detailItem('Período', `${formatDateTime(promocao.dataInicio)} até ${formatDateTime(promocao.dataFim)}`)}
                ${detailItem('Valor em prêmios', formatCurrency(promocao.valorTotal))}
                ${detailItem('Quantidade de prêmios', formatNumber(Number(promocao.quantidadePremios) || 0))}
                ${promocao.quantidadeSeries !== undefined ? detailItem('Séries', promocao.quantidadeSeries) : ''}
                ${detailItem('Abrangência', formatAbrangencia(promocao.abrangencia))}
                ${promocao.codigoAutenticidade ? detailItem('Código de autenticidade', promocao.codigoAutenticidade, 'mono') : ''}
            </dl>
        </section>

        <section class="section">
            <h3>Empresa responsável</h3>
            <dl class="dl">
                ${detailItem('Nome fantasia', mandatario.nomeFantasia)}
                ${mandatario.razaoSocial ? detailItem('Razão social', mandatario.razaoSocial) : ''}
                ${detailItem('CNPJ', formatCNPJDisplay(mandatario.cnpj), 'mono')}
                ${detailItem('Endereço', formatEndereco(mandatario) || [mandatario.cidade, mandatario.uf].filter(Boolean).join(' - '))}
            </dl>
        </section>

        ${detalhesHTML}
    `;

    const copyButton = $('modalBody').querySelector('[data-copy]');
    copyButton.addEventListener('click', () => copyText(copyButton.dataset.copy, 'Certificado copiado'));
}

function detailItem(label, value, className = '') {
    const texto = value === undefined || value === null || value === '' ? 'N/A' : value;
    return `<dt>${escapeHTML(label)}</dt><dd class="${className}">${escapeHTML(String(texto))}</dd>`;
}

function createModalPremiosInfo(apuracoes) {
    if (!Array.isArray(apuracoes)) return '';

    const premios = [];
    apuracoes.forEach((apuracao, apuracaoIndex) => {
        (apuracao.premios || []).forEach(premio => premios.push({ ...premio, apuracao: apuracaoIndex + 1 }));
    });
    if (premios.length === 0) return '';

    const mostrarApuracao = apuracoes.length > 1;
    const total = premios.reduce((soma, p) => soma + (Number(p.valor_total) || 0), 0);
    const quantidade = premios.reduce((soma, p) => soma + (Number(p.quantidade) || 0), 0);

    return `
        <section class="section">
            <h3>Prêmios</h3>
            <div class="table-wrap">
                <table class="table">
                    <thead>
                        <tr>
                            <th>Descrição</th>
                            ${mostrarApuracao ? '<th>Apur.</th>' : ''}
                            <th class="num">Qtd.</th>
                            <th class="num">Unitário</th>
                            <th class="num">Total</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${premios.map(premio => `
                            <tr>
                                <td>${escapeHTML(premio.descricao || 'Descrição não informada')}</td>
                                ${mostrarApuracao ? `<td>${premio.apuracao}</td>` : ''}
                                <td class="num">${formatNumber(Number(premio.quantidade) || 0)}</td>
                                <td class="num">${formatCurrency(premio.valor_unitario)}</td>
                                <td class="num">${formatCurrency(premio.valor_total)}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                    <tfoot>
                        <tr>
                            <td>Total</td>
                            ${mostrarApuracao ? '<td></td>' : ''}
                            <td class="num">${formatNumber(quantidade)}</td>
                            <td></td>
                            <td class="num">${formatCurrency(total)}</td>
                        </tr>
                    </tfoot>
                </table>
            </div>
        </section>
    `;
}

function createModalApuracoesInfo(apuracoes) {
    if (!Array.isArray(apuracoes) || apuracoes.length === 0) return '';

    return `
        <section class="section">
            <h3>Apurações (${apuracoes.length})</h3>
            ${apuracoes.map((apuracao, index) => {
                const local = [apuracao.localApuracao, formatEndereco(apuracao)].filter(Boolean).join(' · ');
                return `
                    <div class="apuracao">
                        <div class="apuracao-title">
                            <span>${index + 1}ª apuração</span>
                            <span>${formatDateTime(apuracao.inicioApuracao || apuracao.fimApuracao)}</span>
                        </div>
                        <p>Participação de ${formatDate(apuracao.inicioParticipacao)} a ${formatDate(apuracao.fimParticipacao)}</p>
                        ${local ? `<p>${escapeHTML(local)}</p>` : ''}
                    </div>
                `;
            }).join('')}
        </section>
    `;
}

function closeModal() {
    if (modal.open) modal.close();
}

function formatCNPJ(input) {
    const numbers = input.value.replace(/\D/g, '').substring(0, 14);
    input.value = numbers
        .replace(/^(\d{2})(\d)/, '$1.$2')
        .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
        .replace(/\.(\d{3})(\d)/, '.$1/$2')
        .replace(/(\d{4})(\d)/, '$1-$2');
}

function cleanCNPJ(cnpj) {
    return cnpj.replace(/\D/g, '');
}

function formatEndereco(origem) {
    if (!origem) return '';
    const parts = [origem.endereco, origem.numero, origem.complemento, origem.bairro, origem.cidade, origem.uf];
    if (origem.cep) parts.push(`CEP ${origem.cep}`);
    return parts.filter(Boolean).join(', ');
}

async function copyText(texto, mensagem) {
    try {
        await navigator.clipboard.writeText(texto);
        showToast(mensagem);
    } catch {
        showToast('Não foi possível copiar');
    }
}

function showToast(mensagem) {
    const toast = $('toast');
    toast.textContent = mensagem;
    toast.classList.add('show');
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => toast.classList.remove('show'), 2000);
}

// ===== Estados =====
function showLoading() {
    hideAllStates();
    searchButton.disabled = true;
    loadingState.classList.remove('hidden');
}

function showError(message) {
    hideAllStates();
    errorMessage.textContent = message;
    errorState.classList.remove('hidden');
}

function hideAllStates() {
    loadingState.classList.add('hidden');
    resultsSection.classList.add('hidden');
    errorState.classList.add('hidden');
    emptyState.classList.add('hidden');
}

function clearFilters() {
    URL_FIELDS.forEach(field => { $(field).value = ''; });
    $('vigentes').checked = false;
    setAno(getAnoAtual());
    updateFilterCount();
    searchForm.requestSubmit();
}
