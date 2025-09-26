// Configuração da API
const API_BASE_URL = '/api/promocoes';

// Elementos do DOM
const searchForm = document.getElementById('searchForm');
const loadingState = document.getElementById('loadingState');
const resultsSection = document.getElementById('resultsSection');
const errorState = document.getElementById('errorState');
const emptyState = document.getElementById('emptyState');
const promocoesContainer = document.getElementById('promocoesContainer');
const resultsTitle = document.getElementById('resultsTitle');
const resultsCount = document.getElementById('resultsCount');
const errorMessage = document.getElementById('errorMessage');
const retryButton = document.getElementById('retryButton');
const clearFiltersButton = document.getElementById('clearFilters');
const paginationContainer = document.getElementById('paginationContainer');
const paginationInfo = document.getElementById('paginationInfo');
const prevPageBtn = document.getElementById('prevPage');
const nextPageBtn = document.getElementById('nextPage');
const pageNumbers = document.getElementById('pageNumbers');

// Estado da aplicação
let currentPromocoes = [];
let currentPagination = null;
let currentPage = 1;

// Inicialização
document.addEventListener('DOMContentLoaded', function() {
    // Configurar ano atual como padrão
    const currentYear = new Date().getFullYear();
    const anoSelect = document.getElementById('anoPromocao');
    anoSelect.value = currentYear;
    
    // Event listeners
    searchForm.addEventListener('submit', handleSearch);
    clearFiltersButton.addEventListener('click', clearFilters);
    retryButton.addEventListener('click', retrySearch);
    prevPageBtn.addEventListener('click', () => changePage(currentPage - 1));
    nextPageBtn.addEventListener('click', () => changePage(currentPage + 1));
    
    // Máscara para CNPJ
    const cnpjInput = document.getElementById('cnpjMandatario');
    cnpjInput.addEventListener('input', formatCNPJ);
    cnpjInput.addEventListener('paste', handleCNPJPaste);
});

// Função principal de busca
async function handleSearch(event) {
    event.preventDefault();
    
    // Resetar página atual para 1 em nova busca
    currentPage = 1;
    currentPagination = null;
    
    const formData = new FormData(searchForm);
    const searchParams = {};
    
    // Coletar parâmetros do formulário
    for (const [key, value] of formData.entries()) {
        if (value.trim() !== '') {
            // Limpar CNPJ removendo formatação antes de enviar
            if (key === 'cnpjMandatario') {
                const cleanedCNPJ = cleanCNPJ(value);
                searchParams[key] = cleanedCNPJ;
                console.log(`CNPJ original: ${value} -> CNPJ limpo: ${cleanedCNPJ}`);
            } else {
                searchParams[key] = value.trim();
            }
        }
    }
    
    // Adicionar parâmetros de paginação
    searchParams.page = 1; // Sempre começar na página 1
    searchParams.limit = 100;
    
    console.log('Parâmetros de busca:', searchParams);
    
    // Validar ano obrigatório
    if (!searchParams.anoPromocao) {
        showError('Por favor, selecione o ano da promoção.');
        return;
    }
    
    try {
        showLoading();
        console.log('Iniciando busca...');
        const promocoes = await fetchPromocoes(searchParams);
        console.log('Promoções encontradas:', promocoes.length);
        currentPromocoes = promocoes;
        displayResults(promocoes);
    } catch (error) {
        console.error('Erro na busca:', error);
        showError(`Erro ao buscar promoções: ${error.message}`);
    }
}

// Função para buscar promoções na API
async function fetchPromocoes(params) {
    const url = new URL(API_BASE_URL, window.location.origin);
    
    // Adicionar parâmetros à URL
    Object.keys(params).forEach(key => {
        url.searchParams.append(key, params[key]);
    });
    
    console.log('Buscando em:', url.toString());
    
    try {
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            }
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        console.log('Dados recebidos:', data);
        
        return processApiResponse(data);
        
    } catch (error) {
        console.error('Erro na requisição:', error);
        throw error;
    }
}

// Função para processar resposta da API
function processApiResponse(data) {
    console.log('=== PROCESS API RESPONSE ===');
    console.log('Data recebida:', data);
    
    // Se tem promoções e paginação, retornar o objeto completo
    if (data.promocoes && Array.isArray(data.promocoes) && data.pagination) {
        console.log('Retornando objeto completo com paginação');
        return data;
    }
    
    // Se tem promoções mas sem paginação, retornar apenas as promoções
    if (data.promocoes && Array.isArray(data.promocoes)) {
        console.log('Retornando apenas promoções (sem paginação)');
        return data.promocoes;
    } else if (Array.isArray(data)) {
        console.log('Retornando array direto');
        return data;
    } else if (data.data && Array.isArray(data.data)) {
        console.log('Retornando data.data');
        return data.data;
    } else {
        // Se não for um array, tentar encontrar propriedades que contenham arrays
        const possibleArrays = Object.values(data).filter(value => Array.isArray(value));
        if (possibleArrays.length > 0) {
            console.log('Retornando primeiro array encontrado');
            return possibleArrays[0];
        }
        console.log('Retornando array vazio');
        return [];
    }
}

// Dados de exemplo para demonstração
function getSampleData() {
    return [
        {
            numeroPromocao: "2024/00001",
            nome: "Promoção de Exemplo - Smartphone",
            modalidade: "Sorteio",
            numeroCA: "CA202400001",
            codigoAutenticidade: "ABC123",
            situacao: "AUTORIZADA",
            dataInicio: "2024-01-01",
            dataFim: "2024-12-31",
            quantidadePremios: 10,
            valorTotal: 50000.00,
            quantidadeSeries: 1,
            abrangencia: "SP, RJ, MG",
            mandatario: {
                cnpj: "12345678000195",
                nomeFantasia: "Empresa Exemplo Ltda",
                razaoSocial: "Empresa Exemplo de Tecnologia Ltda",
                endereco: "Rua das Flores",
                numero: "123",
                complemento: "Sala 45",
                bairro: "Centro",
                cidade: "São Paulo",
                uf: "SP",
                cep: "01234567"
            },
            apuracoes: [
                {
                    idApuracao: 1,
                    localApuracao: "Sede da Empresa",
                    inicioApuracao: "2024-12-31T14:00:00",
                    fimApuracao: "2024-12-31T16:00:00",
                    inicioParticipacao: "2024-01-01",
                    fimParticipacao: "2024-12-30",
                    premios: [
                        {
                            descricao: "Smartphone Galaxy S24",
                            quantidade: 10,
                            valor_unitario: 5000.00,
                            valor_total: 50000.00,
                            ordem: "1",
                            data_entrega: "2025-01-15"
                        }
                    ]
                }
            ]
        }
    ];
}

// Função para exibir resultados
function displayResults(data) {
    hideAllStates();
    
    console.log('=== DISPLAY RESULTS ===');
    console.log('Dados recebidos:', data);
    
    const promocoes = data.promocoes || data;
    const pagination = data.pagination;
    console.log('Data:', data);
    console.log('Promoções:', promocoes.length);
    console.log('Paginação:', pagination);
    
    if (promocoes.length === 0) {
        showEmptyState();
        return;
    }
    
    resultsSection.classList.remove('hidden');
    resultsCount.textContent = pagination ? pagination.totalRecords : promocoes.length;
    
    // Atualizar estado da paginação
    if (pagination) {
        currentPagination = pagination;
        currentPage = pagination.currentPage;
        console.log('=== ATUALIZANDO PAGINAÇÃO ===');
        console.log('currentPagination:', currentPagination);
        updatePagination();
    } else {
        console.log('Sem dados de paginação');
        paginationContainer.classList.add('hidden');
    }
    
    // Forçar exibição da paginação para debug
    if (pagination && pagination.totalPages > 1) {
        console.log('=== FORÇANDO EXIBIÇÃO ===');
        paginationContainer.classList.remove('hidden');
        paginationContainer.style.display = 'flex';
        console.log('Container de paginação:', paginationContainer);
        console.log('Classes do container:', paginationContainer.className);
    }
    
    // Limpar container anterior
    promocoesContainer.innerHTML = '';
    
    // Verificar se são dados de exemplo
    const isSampleData = promocoes.some(p => p.numeroPromocao === "2024/00001");
    if (isSampleData) {
        const sampleNotice = document.createElement('div');
        sampleNotice.className = 'sample-notice';
        sampleNotice.innerHTML = `
            <div style="background: #fff3cd; border: 1px solid #ffeaa7; border-radius: 10px; padding: 15px; margin-bottom: 20px; text-align: center;">
                <i class="fas fa-info-circle" style="color: #856404; margin-right: 8px;"></i>
                <strong style="color: #856404;">Modo Demonstração:</strong>
                <span style="color: #856404;">Exibindo dados de exemplo. A API pode estar temporariamente indisponível.</span>
            </div>
        `;
        promocoesContainer.appendChild(sampleNotice);
    }
    
    // Criar cards para cada promoção
    promocoes.forEach(promocao => {
        const card = createPromocaoCard(promocao);
        promocoesContainer.appendChild(card);
    });
}

// Função para criar card de promoção
function createPromocaoCard(promocao) {
    const card = document.createElement('div');
    card.className = 'promocao-card';
    card.style.cursor = 'pointer';
    
    // Determinar status da promoção
    const status = promocao.situacao || 'N/A';
    const statusClass = getStatusClass(status);
    
    // Formatar datas
    const dataInicio = formatDate(promocao.dataInicio);
    const dataFim = formatDate(promocao.dataFim);
    
    // Formatar valores
    const valorTotal = formatCurrency(promocao.valorTotal);
    
    // Informações básicas do mandatário
    const mandatarioNome = promocao.mandatario?.nomeFantasia || promocao.mandatario?.razaoSocial || 'Nome não informado';
    const mandatarioCnpj = promocao.mandatario?.cnpj ? formatCNPJDisplay(promocao.mandatario.cnpj) : 'N/A';
    const mandatarioEndereco = formatEndereco(promocao.mandatario) || '';
    
    card.innerHTML = `
        <div class="promocao-header">
            <h3 class="promocao-nome">${promocao.nome || 'Nome não informado'}</h3>
            <div class="promocao-modalidade">
                <i class="fas fa-trophy"></i>
                ${promocao.modalidade || 'N/A'}
            </div>
        </div>
        
        <div class="promocao-summary">
            <div class="summary-row">
                <div class="summary-item">
                    <span class="summary-label">Status:</span>
                    <span class="promocao-status ${statusClass}">${status}</span>
                </div>
                <div class="summary-item">
                    <span class="summary-label">Certificado:</span>
                    <span class="summary-value">${promocao.numeroCA || 'N/A'}</span>
                </div>
            </div>
            <div class="summary-row">
                <div class="summary-item">
                    <span class="summary-label">Data Início:</span>
                    <span class="summary-value">${dataInicio}</span>
                </div>
                <div class="summary-item">
                    <span class="summary-label">Data Fim:</span>
                    <span class="summary-value">${dataFim}</span>
                </div>
            </div>
            <div class="summary-row">
                <div class="summary-item">
                    <span class="summary-label">Prêmios:</span>
                    <span class="summary-value">${promocao.quantidadePremios || 0}</span>
                </div>
                <div class="summary-item">
                    <span class="summary-label">Valor Total:</span>
                    <span class="summary-value">${valorTotal}</span>
                </div>
            </div>
            <div class="summary-row">
                <div class="summary-item">
                    <span class="summary-label">Abrangência:</span>
                    <span class="summary-value">${promocao.abrangencia || 'N/A'}</span>
                </div>
            </div>
        </div>
        
        <div class="mandatario-summary">
            <div class="mandatario-nome">${mandatarioNome}</div>
            <div class="mandatario-cnpj">CNPJ: ${mandatarioCnpj}</div>
            ${mandatarioEndereco ? `<div class="mandatario-endereco">${mandatarioEndereco}</div>` : ''}
        </div>
        
        <div class="card-footer">
            <div class="click-hint">
                <i class="fas fa-mouse-pointer"></i>
                Clique para ver detalhes completos
            </div>
        </div>
    `;
    
    // Adicionar evento de clique para mostrar detalhes
    card.addEventListener('click', () => {
        showPromocaoDetails(promocao);
    });
    
    return card;
}

// Função para criar informações do mandatário
function createMandatarioInfo(mandatario) {
    if (!mandatario) return '';
    
    const endereco = formatEndereco(mandatario);
    
    return `
        <div class="mandatario-info">
            <div class="mandatario-nome">${mandatario.nomeFantasia || mandatario.razaoSocial || 'Nome não informado'}</div>
            <div class="mandatario-cnpj">CNPJ: ${formatCNPJDisplay(mandatario.cnpj)}</div>
            ${endereco ? `<div class="mandatario-endereco">${endereco}</div>` : ''}
        </div>
    `;
}

// Função para criar informações das apurações
function createApuracoesInfo(apuracoes) {
    if (!apuracoes || !Array.isArray(apuracoes) || apuracoes.length === 0) return '';
    
    let apuracoesHTML = '<div class="apuracoes-info" style="margin-top: 15px; padding: 15px; background: #f8f9fa; border-radius: 10px;">';
    apuracoesHTML += '<h4 style="margin-bottom: 10px; color: #333; font-size: 1rem;">Apurações:</h4>';
    
    apuracoes.forEach((apuracao, index) => {
        const inicioApuracao = formatDateTime(apuracao.inicioApuracao);
        const fimApuracao = formatDateTime(apuracao.fimApuracao);
        const inicioParticipacao = formatDateTime(apuracao.inicioParticipacao);
        const fimParticipacao = formatDateTime(apuracao.fimParticipacao);
        
        apuracoesHTML += `
            <div style="margin-bottom: 15px; padding: 10px; background: white; border-radius: 8px; border-left: 3px solid #667eea;">
                <div style="font-weight: 600; color: #333; margin-bottom: 5px;">
                    Apuração ${index + 1}: ${apuracao.localApuracao || 'Local não informado'}
                </div>
                <div style="font-size: 0.85rem; color: #666;">
                    <div>Início: ${inicioApuracao}</div>
                    <div>Fim: ${fimApuracao}</div>
                    <div>Participação: ${inicioParticipacao} - ${fimParticipacao}</div>
                </div>
                ${createPremiosInfo(apuracao.premios)}
            </div>
        `;
    });
    
    apuracoesHTML += '</div>';
    return apuracoesHTML;
}

// Função para criar informações dos prêmios
function createPremiosInfo(premios) {
    if (!premios || !Array.isArray(premios) || premios.length === 0) return '';
    
    let premiosHTML = '<div style="margin-top: 10px;"><strong>Prêmios:</strong></div>';
    premios.forEach((premio, index) => {
        const valorUnitario = formatCurrency(premio.valor_unitario);
        const valorTotal = formatCurrency(premio.valor_total);
        const dataEntrega = formatDate(premio.data_entrega);
        
        premiosHTML += `
            <div style="margin-top: 5px; padding: 8px; background: #f1f3f4; border-radius: 5px; font-size: 0.8rem;">
                <div><strong>${premio.descricao || 'Descrição não informada'}</strong></div>
                <div>Quantidade: ${premio.quantidade || 0}</div>
                <div>Valor Unitário: ${valorUnitario}</div>
                <div>Valor Total: ${valorTotal}</div>
                ${dataEntrega !== 'N/A' ? `<div>Entrega: ${dataEntrega}</div>` : ''}
            </div>
        `;
    });
    
    return premiosHTML;
}

// Funções utilitárias
function formatDate(dateString) {
    if (!dateString) return 'N/A';
    
    try {
        const date = new Date(dateString);
        return date.toLocaleDateString('pt-BR');
    } catch (error) {
        return dateString;
    }
}

function formatDateTime(dateTimeString) {
    if (!dateTimeString) return 'N/A';
    
    try {
        const date = new Date(dateTimeString);
        return date.toLocaleString('pt-BR');
    } catch (error) {
        return dateTimeString;
    }
}

function formatCurrency(value) {
    if (!value || isNaN(value)) return 'N/A';
    
    return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL'
    }).format(value);
}

function formatCNPJ(cnpj) {
    // Remove caracteres não numéricos
    const numbers = cnpj.value.replace(/\D/g, '');
    
    // Limita a 14 dígitos
    const limited = numbers.substring(0, 14);
    
    // Aplica a máscara progressivamente
    let formatted = limited;
    if (limited.length > 2) {
        formatted = limited.substring(0, 2) + '.' + limited.substring(2);
    }
    if (limited.length > 5) {
        formatted = limited.substring(0, 2) + '.' + limited.substring(2, 5) + '.' + limited.substring(5);
    }
    if (limited.length > 8) {
        formatted = limited.substring(0, 2) + '.' + limited.substring(2, 5) + '.' + limited.substring(5, 8) + '/' + limited.substring(8);
    }
    if (limited.length > 12) {
        formatted = limited.substring(0, 2) + '.' + limited.substring(2, 5) + '.' + limited.substring(5, 8) + '/' + limited.substring(8, 12) + '-' + limited.substring(12);
    }
    
    cnpj.value = formatted;
}

function handleCNPJPaste(event) {
    // Aguarda um pouco para o valor ser colado no campo
    setTimeout(() => {
        formatCNPJ(event.target);
    }, 10);
}

function cleanCNPJ(cnpj) {
    // Remove todos os caracteres não numéricos do CNPJ
    return cnpj.replace(/\D/g, '');
}

function formatCNPJDisplay(cnpj) {
    if (!cnpj) return 'N/A';
    
    const numbers = cnpj.replace(/\D/g, '');
    if (numbers.length === 14) {
        return numbers.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
    }
    return cnpj;
}

function formatEndereco(mandatario) {
    const parts = [];
    
    if (mandatario.endereco) parts.push(mandatario.endereco);
    if (mandatario.numero) parts.push(mandatario.numero);
    if (mandatario.complemento) parts.push(mandatario.complemento);
    if (mandatario.bairro) parts.push(mandatario.bairro);
    if (mandatario.cidade) parts.push(mandatario.cidade);
    if (mandatario.uf) parts.push(mandatario.uf);
    if (mandatario.cep) parts.push(mandatario.cep);
    
    return parts.length > 0 ? parts.join(', ') : '';
}

function getStatusClass(status) {
    const statusLower = status.toLowerCase();
    if (statusLower.includes('autorizada')) return 'status-autorizada';
    if (statusLower.includes('pendente')) return 'status-pendente';
    if (statusLower.includes('cancelada')) return 'status-cancelada';
    return 'status-pendente';
}

// Funções de controle de estado
function showLoading() {
    hideAllStates();
    loadingState.classList.remove('hidden');
}

function showError(message) {
    hideAllStates();
    errorMessage.textContent = message;
    errorState.classList.remove('hidden');
}

function showEmptyState() {
    hideAllStates();
    emptyState.classList.remove('hidden');
}

function hideAllStates() {
    loadingState.classList.add('hidden');
    resultsSection.classList.add('hidden');
    errorState.classList.add('hidden');
    emptyState.classList.add('hidden');
}

function clearFilters() {
    searchForm.reset();
    hideAllStates();
    currentPromocoes = [];
    currentPagination = null;
    currentPage = 1;
    
    // Resetar para ano atual
    const currentYear = new Date().getFullYear();
    document.getElementById('anoPromocao').value = currentYear;
}

// Função para mostrar detalhes da promoção em modal
function showPromocaoDetails(promocao) {
    // Criar modal se não existir
    let modal = document.getElementById('promocaoModal');
    if (!modal) {
        modal = createModal();
        document.body.appendChild(modal);
    }
    
    // Preencher conteúdo do modal
    fillModalContent(modal, promocao);
    
    // Mostrar modal
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
}

// Função para criar estrutura do modal
function createModal() {
    const modal = document.createElement('div');
    modal.id = 'promocaoModal';
    modal.className = 'modal';
    modal.style.display = 'none';
    
    modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h2>Detalhes da Promoção</h2>
                <button class="modal-close" id="modalCloseBtn">&times;</button>
            </div>
            <div class="modal-body" id="modalBody">
                <!-- Conteúdo será preenchido dinamicamente -->
            </div>
        </div>
    `;
    
    // Adicionar event listener para o botão de fechar
    const closeBtn = modal.querySelector('#modalCloseBtn');
    if (closeBtn) {
        closeBtn.addEventListener('click', closeModal);
        console.log('Event listener adicionado ao botão de fechar');
    } else {
        console.log('ERRO: Botão de fechar não encontrado!');
    }
    
    // Fechar modal ao clicar fora
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            closeModal();
        }
    });
    
    return modal;
}

// Função para preencher conteúdo do modal
function fillModalContent(modal, promocao) {
    const modalBody = modal.querySelector('#modalBody');
    
    // Formatar datas
    const dataInicio = formatDate(promocao.dataInicio);
    const dataFim = formatDate(promocao.dataFim);
    const valorTotal = formatCurrency(promocao.valorTotal);
    
    modalBody.innerHTML = `
        <div class="modal-section">
            <h3>Informações Básicas</h3>
            <div class="detail-grid">
                <div class="detail-item">
                    <span class="detail-label">Número da Promoção:</span>
                    <span class="detail-value">${promocao.numeroPromocao || 'N/A'}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">Nome:</span>
                    <span class="detail-value">${promocao.nome || 'N/A'}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">Modalidade:</span>
                    <span class="detail-value">${promocao.modalidade || 'N/A'}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">Status:</span>
                    <span class="detail-value promocao-status ${getStatusClass(promocao.situacao)}">${promocao.situacao || 'N/A'}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">Certificado:</span>
                    <span class="detail-value">${promocao.numeroCA || 'N/A'}</span>
                </div>
            </div>
        </div>
        
        <div class="modal-section">
            <h3>Período e Valores</h3>
            <div class="detail-grid">
                <div class="detail-item">
                    <span class="detail-label">Data de Início:</span>
                    <span class="detail-value">${dataInicio}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">Data de Fim:</span>
                    <span class="detail-value">${dataFim}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">Quantidade de Prêmios:</span>
                    <span class="detail-value">${promocao.quantidadePremios || 0}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">Valor Total:</span>
                    <span class="detail-value">${valorTotal}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">Abrangência:</span>
                    <span class="detail-value">${promocao.abrangencia || 'N/A'}</span>
                </div>
            </div>
        </div>
        
        ${createModalMandatarioInfo(promocao.mandatario)}
        ${createModalApuracoesInfo(promocao.apuracoes)}
        ${createModalPremiosInfo(promocao.apuracoes)}
    `;
}

// Função para criar informações do mandatário no modal
function createModalMandatarioInfo(mandatario) {
    if (!mandatario) return '';
    
    const endereco = formatEndereco(mandatario);
    
    return `
        <div class="modal-section">
            <h3>Informações do Mandatário</h3>
            <div class="detail-grid">
                <div class="detail-item">
                    <span class="detail-label">Razão Social:</span>
                    <span class="detail-value">${mandatario.razaoSocial || 'N/A'}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">Nome Fantasia:</span>
                    <span class="detail-value">${mandatario.nomeFantasia || 'N/A'}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">CNPJ:</span>
                    <span class="detail-value">${formatCNPJDisplay(mandatario.cnpj)}</span>
                </div>
                ${endereco ? `
                <div class="detail-item full-width">
                    <span class="detail-label">Endereço:</span>
                    <span class="detail-value">${endereco}</span>
                </div>
                ` : ''}
            </div>
        </div>
    `;
}

// Função para criar informações das apurações no modal
function createModalApuracoesInfo(apuracoes) {
    if (!apuracoes || !Array.isArray(apuracoes) || apuracoes.length === 0) return '';
    
    let apuracoesHTML = '<div class="modal-section"><h3>Apurações</h3>';
    
    apuracoes.forEach((apuracao, index) => {
        const enderecoCompleto = formatEnderecoApuracao(apuracao);
        
        apuracoesHTML += `
            <div class="apuracao-item">
                <h4>Apuração ${index + 1}</h4>
                <div class="detail-grid">
                    <div class="detail-item">
                        <span class="detail-label">ID:</span>
                        <span class="detail-value">${apuracao.idApuracao || 'N/A'}</span>
                    </div>
                    <div class="detail-item">
                        <span class="detail-label">Local:</span>
                        <span class="detail-value">${apuracao.localApuracao || 'N/A'}</span>
                    </div>
                    <div class="detail-item">
                        <span class="detail-label">Início da Apuração:</span>
                        <span class="detail-value">${formatDate(apuracao.inicioApuracao) || 'N/A'}</span>
                    </div>
                    <div class="detail-item">
                        <span class="detail-label">Fim da Apuração:</span>
                        <span class="detail-value">${formatDate(apuracao.fimApuracao) || 'N/A'}</span>
                    </div>
                    <div class="detail-item">
                        <span class="detail-label">Início da Participação:</span>
                        <span class="detail-value">${formatDate(apuracao.inicioParticipacao) || 'N/A'}</span>
                    </div>
                    <div class="detail-item">
                        <span class="detail-label">Fim da Participação:</span>
                        <span class="detail-value">${formatDate(apuracao.fimParticipacao) || 'N/A'}</span>
                    </div>
                    ${enderecoCompleto ? `
                    <div class="detail-item full-width">
                        <span class="detail-label">Endereço:</span>
                        <span class="detail-value">${enderecoCompleto}</span>
                    </div>
                    ` : ''}
                </div>
            </div>
        `;
    });
    
    apuracoesHTML += '</div>';
    return apuracoesHTML;
}

// Função para formatar endereço da apuração
function formatEnderecoApuracao(apuracao) {
    const parts = [];
    
    if (apuracao.endereco) parts.push(apuracao.endereco);
    if (apuracao.numero) parts.push(apuracao.numero);
    if (apuracao.complemento) parts.push(apuracao.complemento);
    if (apuracao.bairro) parts.push(apuracao.bairro);
    if (apuracao.cidade) parts.push(apuracao.cidade);
    if (apuracao.uf) parts.push(apuracao.uf);
    if (apuracao.cep) parts.push(apuracao.cep);
    
    return parts.length > 0 ? parts.join(', ') : '';
}

// Função para criar informações dos prêmios no modal
function createModalPremiosInfo(apuracoes) {
    if (!apuracoes || !Array.isArray(apuracoes) || apuracoes.length === 0) return '';
    
    // Coletar todos os prêmios de todas as apurações
    let todosPremios = [];
    apuracoes.forEach((apuracao, apuracaoIndex) => {
        if (apuracao.premios && Array.isArray(apuracao.premios)) {
            apuracao.premios.forEach((premio, premioIndex) => {
                todosPremios.push({
                    ...premio,
                    apuracaoIndex: apuracaoIndex + 1,
                    premioIndex: premioIndex + 1
                });
            });
        }
    });
    
    if (todosPremios.length === 0) return '';
    
    let premiosHTML = '<div class="modal-section"><h3>Prêmios</h3>';
    
    todosPremios.forEach((premio, index) => {
        premiosHTML += `
            <div class="premio-item">
                <h4>Prêmio ${index + 1} (Apuração ${premio.apuracaoIndex})</h4>
                <div class="detail-grid">
                    <div class="detail-item">
                        <span class="detail-label">Descrição:</span>
                        <span class="detail-value">${premio.descricao || 'N/A'}</span>
                    </div>
                    <div class="detail-item">
                        <span class="detail-label">Quantidade:</span>
                        <span class="detail-value">${premio.quantidade || 'N/A'}</span>
                    </div>
                    <div class="detail-item">
                        <span class="detail-label">Valor Unitário:</span>
                        <span class="detail-value">${formatCurrency(premio.valor_unitario) || 'N/A'}</span>
                    </div>
                    <div class="detail-item">
                        <span class="detail-label">Valor Total:</span>
                        <span class="detail-value">${formatCurrency(premio.valor_total) || 'N/A'}</span>
                    </div>
                    <div class="detail-item">
                        <span class="detail-label">Ordem:</span>
                        <span class="detail-value">${premio.ordem || 'N/A'}</span>
                    </div>
                    ${premio.data_entrega ? `
                    <div class="detail-item">
                        <span class="detail-label">Data de Entrega:</span>
                        <span class="detail-value">${formatDate(premio.data_entrega) || 'N/A'}</span>
                    </div>
                    ` : ''}
                </div>
            </div>
        `;
    });
    
    premiosHTML += '</div>';
    return premiosHTML;
}

// Função para fechar modal
function closeModal() {
    console.log('=== CLOSE MODAL ===');
    const modal = document.getElementById('promocaoModal');
    console.log('Modal encontrado:', modal);
    
    if (modal) {
        console.log('Fechando modal...');
        modal.style.display = 'none';
        document.body.style.overflow = 'auto';
        console.log('Modal fechado com sucesso');
    } else {
        console.log('ERRO: Modal não encontrado!');
    }
}

function retrySearch() {
    if (currentPromocoes.length > 0) {
        displayResults(currentPromocoes);
    } else {
        hideAllStates();
    }
}

// Função para lidar com erros de CORS (se necessário)
function handleCORS() {
    // Se houver problemas de CORS, podemos implementar um proxy
    console.log('Implementando proxy para CORS se necessário');
}

// Funções de paginação
function updatePagination() {
    console.log('=== UPDATE PAGINATION ===');
    console.log('currentPagination:', currentPagination);
    console.log('paginationContainer:', paginationContainer);
    console.log('paginationInfo:', paginationInfo);
    
    if (!currentPagination) {
        console.log('Sem paginação, escondendo container');
        paginationContainer.classList.add('hidden');
        return;
    }
    
    console.log('Mostrando container de paginação');
    paginationContainer.classList.remove('hidden');
    paginationContainer.style.display = 'flex';
    
    // Atualizar informações da paginação
    if (paginationInfo) {
        paginationInfo.textContent = `Página ${currentPagination.currentPage} de ${currentPagination.totalPages}`;
        console.log('Info da paginação:', paginationInfo.textContent);
    } else {
        console.log('ERRO: paginationInfo não encontrado!');
    }
    
    // Atualizar botões
    if (prevPageBtn) {
        prevPageBtn.disabled = !currentPagination.hasPrevPage;
        console.log('Botão Anterior:', !prevPageBtn.disabled);
    } else {
        console.log('ERRO: prevPageBtn não encontrado!');
    }
    
    if (nextPageBtn) {
        nextPageBtn.disabled = !currentPagination.hasNextPage;
        console.log('Botão Próxima:', !nextPageBtn.disabled);
    } else {
        console.log('ERRO: nextPageBtn não encontrado!');
    }
    
    // Atualizar números das páginas
    updatePageNumbers();
}

function updatePageNumbers() {
    pageNumbers.innerHTML = '';
    
    const current = currentPagination.currentPage;
    const total = currentPagination.totalPages;
    const maxVisible = 5; // Máximo de números visíveis
    
    let start = Math.max(1, current - Math.floor(maxVisible / 2));
    let end = Math.min(total, start + maxVisible - 1);
    
    // Ajustar início se estivermos no final
    if (end - start + 1 < maxVisible) {
        start = Math.max(1, end - maxVisible + 1);
    }
    
    // Adicionar botão "Primeira página" se necessário
    if (start > 1) {
        addPageNumber(1);
        if (start > 2) {
            addEllipsis();
        }
    }
    
    // Adicionar números das páginas
    for (let i = start; i <= end; i++) {
        addPageNumber(i);
    }
    
    // Adicionar botão "Última página" se necessário
    if (end < total) {
        if (end < total - 1) {
            addEllipsis();
        }
        addPageNumber(total);
    }
}

function addPageNumber(pageNum) {
    const pageBtn = document.createElement('button');
    pageBtn.className = 'page-number';
    pageBtn.textContent = pageNum;
    pageBtn.addEventListener('click', () => changePage(pageNum));
    
    if (pageNum === currentPage) {
        pageBtn.classList.add('active');
    }
    
    pageNumbers.appendChild(pageBtn);
}

function addEllipsis() {
    const ellipsis = document.createElement('span');
    ellipsis.className = 'page-number ellipsis';
    ellipsis.textContent = '...';
    pageNumbers.appendChild(ellipsis);
}

function changePage(page) {
    if (!currentPagination || page < 1 || page > currentPagination.totalPages) {
        return;
    }
    
    currentPage = page;
    
    // Fazer nova busca com a página selecionada
    const formData = new FormData(searchForm);
    const searchParams = {};
    
    // Coletar parâmetros do formulário
    for (const [key, value] of formData.entries()) {
        if (value.trim() !== '') {
            if (key === 'cnpjMandatario') {
                const cleanedCNPJ = cleanCNPJ(value);
                searchParams[key] = cleanedCNPJ;
            } else {
                searchParams[key] = value.trim();
            }
        }
    }
    
    // Adicionar parâmetros de paginação
    searchParams.page = currentPage;
    searchParams.limit = 100;
    
    // Fazer a busca
    console.log('=== CHANGE PAGE ===');
    console.log('Mudando para página:', currentPage);
    console.log('Parâmetros:', searchParams);
    
    fetchPromocoes(searchParams).then(data => {
        console.log('Dados recebidos na mudança de página:', data);
        currentPromocoes = data.promocoes || data;
        displayResults(data);
    }).catch(error => {
        console.error('Erro ao buscar promoções:', error);
        showError(`Erro ao buscar promoções: ${error.message}`);
    });
}

// Inicializar tratamento de CORS
handleCORS();
