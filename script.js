// Configuração da API
const API_BASE_URL = 'https://api.scpc.estaleiro.serpro.gov.br/v1/promocao-comercial/export/json';

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

// Estado da aplicação
let currentPromocoes = [];

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
    
    // Máscara para CNPJ
    const cnpjInput = document.getElementById('cnpjMandatario');
    cnpjInput.addEventListener('input', formatCNPJ);
});

// Função principal de busca
async function handleSearch(event) {
    event.preventDefault();
    
    const formData = new FormData(searchForm);
    const searchParams = {};
    
    // Coletar parâmetros do formulário
    for (const [key, value] of formData.entries()) {
        if (value.trim() !== '') {
            searchParams[key] = value.trim();
        }
    }
    
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
    const url = new URL(API_BASE_URL);
    
    // Adicionar parâmetros à URL
    Object.keys(params).forEach(key => {
        url.searchParams.append(key, params[key]);
    });
    
    console.log('Buscando em:', url.toString());
    
    try {
        // Tentar primeiro com proxy CORS
        const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(url.toString())}`;
        
        console.log('Tentando com proxy:', proxyUrl);
        
        const response = await fetch(proxyUrl, {
            method: 'GET',
            headers: {
                'Accept': 'application/json'
            }
        });
        
        if (!response.ok) {
            throw new Error(`Proxy error! status: ${response.status}`);
        }
        
        const proxyData = await response.json();
        
        if (!proxyData.contents) {
            throw new Error('Proxy retornou dados vazios');
        }
        
        const data = JSON.parse(proxyData.contents);
        console.log('Dados recebidos via proxy:', data);
        
        return processApiResponse(data);
        
    } catch (proxyError) {
        console.error('Erro no proxy:', proxyError);
        
        // Fallback: tentar requisição direta
        try {
            console.log('Tentando requisição direta...');
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
            console.log('Dados recebidos diretamente:', data);
            
            return processApiResponse(data);
            
        } catch (directError) {
            console.error('Erro na requisição direta:', directError);
            
            // Último fallback: usar dados de exemplo para demonstração
            console.log('Usando dados de exemplo...');
            return getSampleData();
        }
    }
}

// Função para processar resposta da API
function processApiResponse(data) {
    if (Array.isArray(data)) {
        return data;
    } else if (data.promocoes && Array.isArray(data.promocoes)) {
        return data.promocoes;
    } else if (data.data && Array.isArray(data.data)) {
        return data.data;
    } else {
        // Se não for um array, tentar encontrar propriedades que contenham arrays
        const possibleArrays = Object.values(data).filter(value => Array.isArray(value));
        if (possibleArrays.length > 0) {
            return possibleArrays[0];
        }
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
function displayResults(promocoes) {
    hideAllStates();
    
    if (promocoes.length === 0) {
        showEmptyState();
        return;
    }
    
    resultsSection.classList.remove('hidden');
    resultsCount.textContent = promocoes.length;
    
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
    
    // Determinar status da promoção
    const status = promocao.situacao || 'N/A';
    const statusClass = getStatusClass(status);
    
    // Formatar datas
    const dataInicio = formatDate(promocao.dataInicio);
    const dataFim = formatDate(promocao.dataFim);
    
    // Formatar valores
    const valorTotal = formatCurrency(promocao.valorTotal);
    
    card.innerHTML = `
        <div class="promocao-header">
            <div class="promocao-numero">${promocao.numeroPromocao || 'N/A'}</div>
            <h3 class="promocao-nome">${promocao.nome || 'Nome não informado'}</h3>
            <div class="promocao-modalidade">
                <i class="fas fa-trophy"></i>
                ${promocao.modalidade || 'N/A'}
            </div>
        </div>
        
        <div class="promocao-details">
            <div class="detail-row">
                <span class="detail-label">Status:</span>
                <span class="promocao-status ${statusClass}">${status}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">Certificado:</span>
                <span class="detail-value">${promocao.numeroCA || 'N/A'}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">Data Início:</span>
                <span class="detail-value">${dataInicio}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">Data Fim:</span>
                <span class="detail-value">${dataFim}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">Prêmios:</span>
                <span class="detail-value">${promocao.quantidadePremios || 0}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">Valor Total:</span>
                <span class="detail-value">${valorTotal}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">Abrangência:</span>
                <span class="detail-value">${promocao.abrangencia || 'N/A'}</span>
            </div>
        </div>
        
        ${createMandatarioInfo(promocao.mandatario)}
        ${createApuracoesInfo(promocao.apuracoes)}
    `;
    
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
    
    // Aplica a máscara
    let formatted = limited;
    if (limited.length > 2) {
        formatted = limited.substring(0, 2) + '.' + limited.substring(2);
    }
    if (limited.length > 5) {
        formatted = formatted.substring(0, 6) + '.' + limited.substring(5);
    }
    if (limited.length > 8) {
        formatted = formatted.substring(0, 10) + '/' + limited.substring(8);
    }
    if (limited.length > 12) {
        formatted = formatted.substring(0, 15) + '-' + limited.substring(12);
    }
    
    cnpj.value = formatted;
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
    
    // Resetar para ano atual
    const currentYear = new Date().getFullYear();
    document.getElementById('anoPromocao').value = currentYear;
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

// Inicializar tratamento de CORS
handleCORS();
