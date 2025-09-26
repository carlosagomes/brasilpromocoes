// Dashboard JavaScript
const API_BASE_URL = '/api/dashboard';

// Elementos do DOM
const dashboardFilters = document.getElementById('dashboardFilters');
const loadingState = document.getElementById('loadingState');
const errorState = document.getElementById('errorState');
const dashboardContent = document.getElementById('dashboardContent');
const errorMessage = document.getElementById('errorMessage');
const retryButton = document.getElementById('retryButton');

// Elementos dos cards de resumo
const totalCampanhas = document.getElementById('totalCampanhas');
const valorTotal = document.getElementById('valorTotal');
const totalMandatarios = document.getElementById('totalMandatarios');

// Controles dos gráficos

// Variáveis dos gráficos
let estadosChart = null;
let valoresChart = null;
let anosChart = null;
let topCnpjChart = null;

// Estado da aplicação
let currentData = null;
let isLoading = false;
let isInitialized = false;

// Inicialização
document.addEventListener('DOMContentLoaded', function() {
    console.log('DOM carregado, aguardando Chart.js...');
    waitForChartJS();
});

function waitForChartJS(attempts = 0) {
    const maxAttempts = 50; // 5 segundos máximo
    
    if (typeof Chart !== 'undefined') {
        console.log('Chart.js carregado com sucesso!');
        initializeDashboard();
    } else if (attempts < maxAttempts) {
        console.log(`Tentativa ${attempts + 1}/${maxAttempts} - Aguardando Chart.js...`);
        setTimeout(() => waitForChartJS(attempts + 1), 100);
    } else {
        console.error('Chart.js não carregou após 5 segundos');
        showError('Erro ao carregar biblioteca de gráficos. Verifique sua conexão e recarregue a página.');
    }
}

function initializeDashboard() {
    if (isInitialized) {
        console.log('Dashboard já inicializado, ignorando...');
        return;
    }
    
    console.log('Inicializando dashboard...');
    isInitialized = true;
    
    // Configurar ano 2025 como padrão
    const defaultYear = 2025;
    const anoFiltro = document.getElementById('anoFiltro');
    
    if (anoFiltro) {
        anoFiltro.value = defaultYear;
        console.log('Ano padrão definido para:', defaultYear);
    }
    
    // Event listeners
    dashboardFilters.addEventListener('submit', handleFilterSubmit);
    retryButton.addEventListener('click', loadDashboardData);
    
    // Carregar dados iniciais
    loadDashboardData();
}

// Função principal de filtro
async function handleFilterSubmit(event) {
    event.preventDefault();
    loadDashboardData();
}

// Carregar dados do dashboard
async function loadDashboardData() {
    // Prevenir múltiplas chamadas simultâneas
    if (isLoading) {
        console.log('Carregamento já em andamento, ignorando...');
        return;
    }
    
    try {
        isLoading = true;
        showLoading();
        
        const formData = new FormData(dashboardFilters);
        const params = new URLSearchParams();
        
        for (const [key, value] of formData.entries()) {
            if (value.trim() !== '') {
                params.append(key, value.trim());
            }
        }
        
        console.log('Carregando dados do dashboard...');
        const response = await fetch(`${API_BASE_URL}?${params.toString()}`);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        console.log('Dados recebidos:', data);
        
        currentData = data;
        updateDashboard(data);
        showDashboard();
        
    } catch (error) {
        console.error('Erro ao carregar dashboard:', error);
        showError(`Erro ao carregar dados: ${error.message}`);
    } finally {
        isLoading = false;
    }
}

// Atualizar dashboard com os dados
function updateDashboard(data) {
    // Atualizar cards de resumo
    updateSummaryCards(data.summary);
    
    // Atualizar gráficos
    updateEstadosChart(data.estados);
    updateValoresChart(data.valoresPorMes);
    updateAnosChart(data.campanhasPorAno);
    updateTopCnpjChart(data.topCnpjs);
}

// Atualizar cards de resumo
function updateSummaryCards(summary) {
    if (totalCampanhas) {
        totalCampanhas.textContent = formatNumber(summary.totalCampanhas);
    }
    if (valorTotal) {
        valorTotal.textContent = formatCurrency(summary.valorTotal);
    }
    if (totalMandatarios) {
        totalMandatarios.textContent = formatNumber(summary.totalMandatarios);
    }
}

// Atualizar gráfico de estados
function updateEstadosChart(estadosData) {
    if (typeof Chart === 'undefined') {
        console.error('Chart.js não está disponível');
        return;
    }
    
    const ctx = document.getElementById('estadosChart');
    if (!ctx) return;
    
    if (estadosChart) {
        estadosChart.destroy();
    }
    
    // Processar dados para mostrar apenas top 10 + outros
    const top10 = estadosData.slice(0, 10);
    const outros = estadosData.slice(10);
    const outrosTotal = outros.reduce((sum, item) => sum + item.total, 0);
    
    let labels = top10.map(item => {
        const estado = item.estado || 'Nacional';
        // Truncar labels muito longos
        return estado.length > 15 ? estado.substring(0, 15) + '...' : estado;
    });
    let data = top10.map(item => item.total);
    
    // Adicionar "Outros" se houver
    if (outrosTotal > 0) {
        labels.push('Outros');
        data.push(outrosTotal);
    }
    
    const colors = generateColors(labels.length);
    
    estadosChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: data,
                backgroundColor: colors,
                borderWidth: 2,
                borderColor: '#fff'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        padding: 20,
                        usePointStyle: true
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const label = context.label || '';
                            const value = context.parsed;
                            const total = context.dataset.data.reduce((a, b) => a + b, 0);
                            const percentage = ((value / total) * 100).toFixed(1);
                            
                            if (label === 'Outros') {
                                return `Outros: ${formatNumber(value)} campanhas (${percentage}%)`;
                            }
                            
                            return `${label}: ${formatNumber(value)} campanhas (${percentage}%)`;
                        }
                    }
                }
            }
        }
    });
}

// Atualizar gráfico de valores por mês
function updateValoresChart(valoresData) {
    if (typeof Chart === 'undefined') {
        console.error('Chart.js não está disponível');
        return;
    }
    
    const ctx = document.getElementById('valoresChart');
    if (!ctx) return;
    
    if (valoresChart) {
        valoresChart.destroy();
    }
    
    const labels = valoresData.map(item => item.mes);
    const data = valoresData.map(item => parseFloat(item.valor) || 0);
    
    valoresChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Valor Total (R$)',
                data: data,
                borderColor: '#667eea',
                backgroundColor: 'rgba(102, 126, 234, 0.1)',
                borderWidth: 3,
                fill: true,
                tension: 0.4,
                pointBackgroundColor: '#667eea',
                pointBorderColor: '#fff',
                pointBorderWidth: 2,
                pointRadius: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    callbacks: {
                        title: function(context) {
                            return context[0].label;
                        },
                        label: function(context) {
                            const item = valoresData[context.dataIndex];
                            const valor = formatCurrency(context.parsed.y);
                            const campanhas = item.totalCampanhas || 0;
                            return [
                                `Valor Total: ${valor}`,
                                `Campanhas: ${formatNumber(campanhas)}`
                            ];
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        callback: function(value) {
                            return formatCurrency(value);
                        }
                    }
                }
            }
        }
    });
}

// Atualizar gráfico de campanhas por ano
function updateAnosChart(anosData) {
    if (typeof Chart === 'undefined') {
        console.error('Chart.js não está disponível');
        return;
    }
    
    const ctx = document.getElementById('anosChart');
    if (!ctx) return;
    
    if (anosChart) {
        anosChart.destroy();
    }
    
    const labels = anosData.map(item => item.ano);
    const data = anosData.map(item => item.total);
    
    anosChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Total de Campanhas',
                data: data,
                backgroundColor: 'rgba(102, 126, 234, 0.8)',
                borderColor: '#667eea',
                borderWidth: 2,
                borderRadius: 8,
                borderSkipped: false
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return `Campanhas: ${formatNumber(context.parsed.y)}`;
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        callback: function(value) {
                            return formatNumber(value);
                        }
                    }
                }
            }
        }
    });
}

// Atualizar gráfico de top CNPJs
function updateTopCnpjChart(cnpjData) {
    if (typeof Chart === 'undefined') {
        console.error('Chart.js não está disponível');
        return;
    }
    
    const ctx = document.getElementById('topCnpjChart');
    if (!ctx) return;
    
    if (topCnpjChart) {
        topCnpjChart.destroy();
    }
    
    const labels = cnpjData.map(item => {
        const nome = item.NomeFantasia || item.RazaoSocial || item.nomeFantasia || item.razaoSocial || 'Sem nome';
        // Truncar nomes muito longos
        return nome.length > 30 ? nome.substring(0, 30) + '...' : nome;
    });
    const data = cnpjData.map(item => item.total);
    
    topCnpjChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Total de Campanhas',
                data: data,
                backgroundColor: 'rgba(240, 147, 251, 0.8)',
                borderColor: '#f093fb',
                borderWidth: 2,
                borderRadius: 8
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            indexAxis: 'y',
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    callbacks: {
                        title: function(context) {
                            const item = cnpjData[context[0].dataIndex];
                            const nome = item.NomeFantasia || item.RazaoSocial || item.nomeFantasia || item.razaoSocial || 'Sem nome';
                            return nome;
                        },
                        label: function(context) {
                            const item = cnpjData[context.dataIndex];
                            const cnpj = item.CNPJ || item.cnpj || 'CNPJ não informado';
                            return [
                                `CNPJ: ${cnpj}`,
                                `Campanhas: ${formatNumber(context.parsed.x)}`
                            ];
                        }
                    }
                }
            },
            scales: {
                x: {
                    beginAtZero: true,
                    ticks: {
                        callback: function(value) {
                            return formatNumber(value);
                        }
                    }
                }
            }
        }
    });
}


// Atualizar gráfico de valores

// Atualizar gráfico de top CNPJs

// Funções de estado da UI
function showLoading() {
    loadingState.classList.remove('hidden');
    errorState.classList.add('hidden');
    dashboardContent.classList.add('hidden');
}

function showError(message) {
    errorMessage.textContent = message;
    loadingState.classList.add('hidden');
    errorState.classList.remove('hidden');
    dashboardContent.classList.add('hidden');
}

function showDashboard() {
    loadingState.classList.add('hidden');
    errorState.classList.add('hidden');
    dashboardContent.classList.remove('hidden');
}

// Funções utilitárias
function formatNumber(num) {
    return new Intl.NumberFormat('pt-BR').format(num);
}

function formatCurrency(value) {
    return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL'
    }).format(value);
}

function generateColors(count) {
    const colors = [
        '#667eea', '#764ba2', '#f093fb', '#f5576c',
        '#4facfe', '#00f2fe', '#43e97b', '#38f9d7',
        '#ffecd2', '#fcb69f', '#a8edea', '#fed6e3'
    ];
    
    const result = [];
    for (let i = 0; i < count; i++) {
        result.push(colors[i % colors.length]);
    }
    return result;
}
