// Código compartilhado entre a busca (script.js) e os relatórios (relatorios.js)

const PRIMEIRO_ANO = 2017;
const ANOS_EM_DESTAQUE = 4;
const FUSO = 'America/Sao_Paulo';

const $ = (id) => document.getElementById(id);

// Situações retornadas pela API SCPC
const SITUACOES = {
    AUTORIZADA: { label: 'Autorizada', cor: 'st-green' },
    ADITADA: { label: 'Aditada', cor: 'st-blue' },
    HOMOLOGADA: { label: 'Homologada', cor: 'st-teal' },
    EM_PRESTACAO_CONTAS: { label: 'Em prestação de contas', cor: 'st-amber' },
    EM_PRESTACAO_CONTAS_PENDENCIAS: { label: 'Prestação com pendências', cor: 'st-orange' },
    NAO_HOMOLOGADA: { label: 'Não homologada', cor: 'st-red' },
    CANCELADA: { label: 'Cancelada', cor: 'st-red' }
};

// Ano atual no fuso de Brasília: vira sozinho em 1º de janeiro, sem atualizar o código
function getAnoAtual() {
    return Number(new Intl.DateTimeFormat('en-US', { timeZone: FUSO, year: 'numeric' }).format(new Date()));
}

// Botões dos anos mais recentes + seletor com todos os anos, gerados a partir do ano atual
function criarSeletorAno(botoesEl, selectEl, aoEscolher) {
    const atual = getAnoAtual();

    // Próximo ano também aparece: promoções podem ser autorizadas com antecedência
    const anos = [];
    for (let ano = atual + 1; ano >= PRIMEIRO_ANO; ano--) anos.push(ano);

    const destaque = anos.filter(ano => ano <= atual).slice(0, ANOS_EM_DESTAQUE);
    botoesEl.innerHTML = destaque.map(ano => `
        <button type="button" class="seg-btn" role="radio" data-ano="${ano}"${ano === atual ? ' title="Ano atual"' : ''}>${ano}</button>
    `).join('');

    selectEl.innerHTML = `<option value="" disabled>Outro ano</option>` +
        anos.map(ano => `<option value="${ano}">${ano}${ano === atual + 1 ? ' (próximo)' : ''}</option>`).join('');

    function marcar(ano) {
        let emDestaque = false;
        botoesEl.querySelectorAll('.seg-btn').forEach(botao => {
            const ativo = botao.dataset.ano === String(ano);
            botao.classList.toggle('active', ativo);
            botao.setAttribute('aria-checked', ativo);
            if (ativo) emDestaque = true;
        });
        // O seletor só mostra o ano quando ele não está entre os botões
        selectEl.value = emDestaque ? '' : String(ano);
        selectEl.classList.toggle('active', !emDestaque);
    }

    botoesEl.addEventListener('click', (event) => {
        const botao = event.target.closest('.seg-btn');
        if (!botao) return;
        marcar(botao.dataset.ano);
        aoEscolher(Number(botao.dataset.ano));
    });

    selectEl.addEventListener('change', () => {
        marcar(selectEl.value);
        aoEscolher(Number(selectEl.value));
    });

    return { marcar, atual, anos };
}

// Ano válido vindo da URL, ou o ano atual
function anoDaURL(params) {
    const atual = getAnoAtual();
    const ano = Number(params.get('ano'));
    return ano >= PRIMEIRO_ANO && ano <= atual + 1 ? ano : atual;
}

// ===== Utilitários =====
function escapeHTML(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[char]));
}

function normalize(texto) {
    return String(texto || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

function debounce(fn, wait) {
    let timer;
    return (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => fn(...args), wait);
    };
}

function anoDe(data) {
    return Number(String(data).slice(0, 4));
}

// "Assemelhada a Sorteio" (como vem da API) vira "Assemelhado a sorteio"
function formatModalidade(modalidade) {
    if (!modalidade) return 'N/A';
    const texto = modalidade.replace(/^Assemelhada/i, 'Assemelhado').toLowerCase();
    return texto.charAt(0).toUpperCase() + texto.slice(1);
}

const PALAVRAS_MINUSCULAS = new Set(['de', 'da', 'do', 'das', 'dos', 'e']);

function toTitleCase(texto) {
    if (!texto) return '';
    return texto.toLowerCase().split(' ').map((palavra, i) =>
        i > 0 && PALAVRAS_MINUSCULAS.has(palavra) ? palavra : palavra.charAt(0).toUpperCase() + palavra.slice(1)
    ).join(' ');
}

function getSituacao(status) {
    if (SITUACOES[status]) return SITUACOES[status];
    const label = String(status || 'N/A').replace(/_/g, ' ').toLowerCase();
    return { label: label.charAt(0).toUpperCase() + label.slice(1), cor: 'st-gray' };
}

function isEmAndamento(promocao, agora = Date.now()) {
    const inicio = new Date(promocao.dataInicio).getTime();
    const fim = new Date(promocao.dataFim).getTime();
    return inicio <= agora && agora <= fim;
}

function formatDate(dateString) {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    if (isNaN(date)) return dateString;
    return date.toLocaleDateString('pt-BR', { timeZone: FUSO });
}

// Período curto para a lista: "04/12 – 24/12/2026" ou "13/11/26 – 14/01/27"
function formatPeriodo(inicio, fim) {
    const a = new Date(inicio);
    const b = new Date(fim);
    if (isNaN(a) || isNaN(b)) return `${formatDate(inicio)} – ${formatDate(fim)}`;

    const curto = { timeZone: FUSO, day: '2-digit', month: '2-digit' };
    if (anoDe(inicio) === anoDe(fim)) {
        return `${a.toLocaleDateString('pt-BR', curto)} – ${formatDate(fim)}`;
    }
    const comAno = { ...curto, year: '2-digit' };
    return `${a.toLocaleDateString('pt-BR', comAno)} – ${b.toLocaleDateString('pt-BR', comAno)}`;
}

function formatDateTime(dateTimeString) {
    if (!dateTimeString) return 'N/A';
    const date = new Date(dateTimeString);
    if (isNaN(date)) return dateTimeString;
    return date.toLocaleString('pt-BR', { timeZone: FUSO, dateStyle: 'short', timeStyle: 'short' });
}

function formatCurrency(value) {
    if (value === null || value === undefined || value === '' || isNaN(value)) return 'N/A';
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

function formatCompactCurrency(value) {
    return new Intl.NumberFormat('pt-BR', {
        style: 'currency', currency: 'BRL', notation: 'compact', maximumFractionDigits: 1
    }).format(value);
}

function formatNumber(value) {
    return new Intl.NumberFormat('pt-BR').format(value);
}

function formatAbrangencia(abrangencia) {
    if (!abrangencia) return 'N/A';
    if (abrangencia.trim() === 'BR') return 'Nacional (todo o Brasil)';
    const ufs = abrangencia.split(',').map(uf => uf.trim()).filter(Boolean);
    return ufs.length >= 27 ? 'Nacional (todos os estados)' : ufs.join(', ');
}

function formatCNPJDisplay(cnpj) {
    if (!cnpj) return 'N/A';
    const numbers = cnpj.replace(/\D/g, '');
    if (numbers.length === 14) {
        return numbers.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
    }
    return cnpj;
}
