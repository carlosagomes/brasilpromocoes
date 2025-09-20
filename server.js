const express = require('express');
const cors = require('cors');
const axios = require('axios');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// API SCPC base URL
const SCPC_API_URL = 'https://api.scpc.estaleiro.serpro.gov.br/v1/promocao-comercial/export/json';

// Middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://cdnjs.cloudflare.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com", "https://cdnjs.cloudflare.com"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "https://api.scpc.estaleiro.serpro.gov.br"]
    }
  }
}));

app.use(compression());
app.use(morgan('combined'));
app.use(cors({
  origin: process.env.NODE_ENV === 'production' ? false : true,
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Servir arquivos estáticos
app.use(express.static(path.join(__dirname, 'public')));

// Cache para requisições (5 minutos)
const cache = new Map();
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutos

// Função para limpar cache expirado
function cleanExpiredCache() {
  const now = Date.now();
  for (const [key, value] of cache.entries()) {
    if (now - value.timestamp > CACHE_DURATION) {
      cache.delete(key);
    }
  }
}

// Limpar cache a cada 10 minutos
setInterval(cleanExpiredCache, 10 * 60 * 1000);

// Rota principal - servir o site
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Rota da API para buscar promoções
app.get('/api/promocoes', async (req, res) => {
    try {
        const { 
            anoPromocao, 
            uf, 
            cnpjMandatario, 
            nomeMandatario, 
            modalidade, 
            numeroCertificado, 
            nomePromocao,
            dataInicio,
            dataFim,
            situacao
        } = req.query;

    // Validar parâmetros obrigatórios
    if (!anoPromocao) {
      return res.status(400).json({
        error: 'Parâmetro anoPromocao é obrigatório',
        message: 'Por favor, forneça o ano da promoção'
      });
    }

    // Criar chave do cache baseada nos parâmetros (sem filtros de data/status)
    const baseQuery = { anoPromocao, uf, cnpjMandatario, nomeMandatario, modalidade, numeroCertificado, nomePromocao };
    const cacheKey = JSON.stringify(baseQuery);
    
    // Verificar cache apenas para dados base (sem filtros de data/status)
    let data;
    if (cache.has(cacheKey) && !dataInicio && !dataFim && !situacao) {
      const cached = cache.get(cacheKey);
      if (Date.now() - cached.timestamp < CACHE_DURATION) {
        console.log('Retornando dados do cache');
        data = cached.data;
      } else {
        data = await fetchFromSCPC();
      }
    } else {
      console.log('Buscando dados da API SCPC (com filtros ou cache expirado)');
      // Usar estratégia inteligente quando há filtros de data/status
      if (dataInicio || dataFim || situacao) {
        data = await fetchDataWithStrategy();
      } else {
        data = await fetchFromSCPC();
      }
    }
    
    async function fetchFromSCPC() {
      // Construir URL da API SCPC
      const apiUrl = new URL(SCPC_API_URL);
      
      // Adicionar parâmetros
      if (anoPromocao) apiUrl.searchParams.append('anoPromocao', anoPromocao);
      if (uf) apiUrl.searchParams.append('uf', uf);
      if (cnpjMandatario) apiUrl.searchParams.append('cnpjMandatario', cnpjMandatario);
      if (nomeMandatario) apiUrl.searchParams.append('nomeMandatario', nomeMandatario);
      if (modalidade) apiUrl.searchParams.append('modalidade', modalidade);
      if (numeroCertificado) apiUrl.searchParams.append('numeroCertificado', numeroCertificado);
      if (nomePromocao) apiUrl.searchParams.append('nomePromocao', nomePromocao);

      console.log('Buscando na API SCPC:', apiUrl.toString());

      // Fazer requisição para a API SCPC
      const response = await axios.get(apiUrl.toString(), {
        timeout: 30000, // 30 segundos
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Brasil-Promocoes/1.0'
        }
      });

      let data = response.data;

      // Processar resposta da API
      if (Array.isArray(data)) {
        data = { promocoes: data };
      } else if (data.promocoes && Array.isArray(data.promocoes)) {
        // Já está no formato correto
      } else if (data.data && Array.isArray(data.data)) {
        data = { promocoes: data.data };
      } else {
        // Tentar encontrar arrays em outras propriedades
        const possibleArrays = Object.values(data).filter(value => Array.isArray(value));
        if (possibleArrays.length > 0) {
          data = { promocoes: possibleArrays[0] };
        } else {
          data = { promocoes: [] };
        }
      }
      
      return data;
    }

    // Função para buscar dados com estratégia inteligente
    async function fetchDataWithStrategy() {
      let allPromocoes = [];
      
      // Estratégia 1: Busca geral por ano
      try {
        const generalData = await fetchFromSCPC();
        allPromocoes = generalData.promocoes || [];
        console.log(`Estratégia 1 (geral): ${allPromocoes.length} promoções`);
      } catch (error) {
        console.error('Erro na busca geral:', error.message);
      }
      
      // Estratégia 2: Se há filtros de data/status e poucos resultados, tentar buscar por modalidades
      if ((dataInicio || dataFim || situacao) && allPromocoes.length < 100) {
        const modalidades = ['Sorteio', 'Concurso', 'Vale-Brinde', 'Assemelhado a Sorteio', 'Assemelhado a Concurso', 'Assemelhado a Vale-Brinde'];
        
        for (const modalidade of modalidades) {
          try {
            const modalidadeData = await fetchFromSCPCWithModalidade(modalidade);
            const novasPromocoes = modalidadeData.promocoes || [];
            
            // Adicionar apenas promoções que não estão na lista
            const idsExistentes = new Set(allPromocoes.map(p => p.numeroPromocao));
            const promocoesNovas = novasPromocoes.filter(p => !idsExistentes.has(p.numeroPromocao));
            
            allPromocoes = allPromocoes.concat(promocoesNovas);
            console.log(`Estratégia 2 (${modalidade}): +${promocoesNovas.length} promoções (total: ${allPromocoes.length})`);
            
            // Se já temos muitos resultados, parar
            if (allPromocoes.length > 5000) break;
          } catch (error) {
            console.error(`Erro na busca por modalidade ${modalidade}:`, error.message);
          }
        }
      }
      
      return { promocoes: allPromocoes };
    }

    // Função auxiliar para buscar por modalidade
    async function fetchFromSCPCWithModalidade(modalidade) {
      const apiUrl = new URL(SCPC_API_URL);
      if (anoPromocao) apiUrl.searchParams.append('anoPromocao', anoPromocao);
      if (uf) apiUrl.searchParams.append('uf', uf);
      if (cnpjMandatario) apiUrl.searchParams.append('cnpjMandatario', cnpjMandatario);
      if (nomeMandatario) apiUrl.searchParams.append('nomeMandatario', nomeMandatario);
      if (modalidade) apiUrl.searchParams.append('modalidade', modalidade);
      if (numeroCertificado) apiUrl.searchParams.append('numeroCertificado', numeroCertificado);
      if (nomePromocao) apiUrl.searchParams.append('nomePromocao', nomePromocao);

      const response = await axios.get(apiUrl.toString(), {
        timeout: 30000,
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Brasil-Promocoes/1.0'
        }
      });

      let data = response.data;
      if (Array.isArray(data)) {
        data = { promocoes: data };
      } else if (data.promocoes && Array.isArray(data.promocoes)) {
        // Já está no formato correto
      } else if (data.data && Array.isArray(data.data)) {
        data = { promocoes: data.data };
      } else {
        const possibleArrays = Object.values(data).filter(value => Array.isArray(value));
        if (possibleArrays.length > 0) {
          data = { promocoes: possibleArrays[0] };
        } else {
          data = { promocoes: [] };
        }
      }
      
      return data;
    }

    // Aplicar filtros de data e status se fornecidos
    let filteredPromocoes = data.promocoes || [];
    
    if (dataInicio || dataFim || situacao) {
      console.log(`Aplicando filtros: dataInicio=${dataInicio}, dataFim=${dataFim}, situacao=${situacao}`);
      console.log(`Total antes do filtro: ${filteredPromocoes.length}`);
      console.log(`Primeira promoção: ${JSON.stringify(filteredPromocoes[0] ? {
        numeroPromocao: filteredPromocoes[0].numeroPromocao,
        dataInicio: filteredPromocoes[0].dataInicio,
        dataFim: filteredPromocoes[0].dataFim,
        situacao: filteredPromocoes[0].situacao
      } : 'N/A')}`);
      
      filteredPromocoes = filteredPromocoes.filter(promocao => {
        // Filtro por data de início (promoção deve começar após a data de início)
        if (dataInicio && promocao.dataInicio) {
          const promocaoInicio = new Date(promocao.dataInicio);
          const filtroInicio = new Date(dataInicio + 'T00:00:00.000Z');
          if (promocaoInicio < filtroInicio) {
            console.log(`Filtrado por data início: ${promocao.numeroPromocao} - ${promocao.dataInicio} < ${dataInicio}`);
            return false;
          }
        }
        
        // Filtro por data de fim (promoção deve terminar antes da data de fim)
        if (dataFim && promocao.dataFim) {
          const promocaoFim = new Date(promocao.dataFim);
          const filtroFim = new Date(dataFim + 'T23:59:59.999Z');
          if (promocaoFim > filtroFim) {
            console.log(`Filtrado por data fim: ${promocao.numeroPromocao} - ${promocao.dataFim} > ${dataFim}`);
            return false;
          }
        }
        
        // Filtro por situação
        if (situacao && promocao.situacao) {
          if (promocao.situacao !== situacao) {
            console.log(`Filtrado por situação: ${promocao.numeroPromocao} - ${promocao.situacao} !== ${situacao}`);
            return false;
          }
        }
        
        return true;
      });
      
      console.log(`Total após filtro: ${filteredPromocoes.length}`);
    }

    // Adicionar metadados
    const result = {
      promocoes: filteredPromocoes,
      metadata: {
        total: filteredPromocoes.length,
        totalOriginal: data.promocoes ? data.promocoes.length : 0,
        timestamp: new Date().toISOString(),
        query: req.query,
        filtersApplied: {
          dataInicio: !!dataInicio,
          dataFim: !!dataFim,
          situacao: !!situacao
        }
      }
    };

    // Salvar no cache apenas se não houver filtros de data/status
    if (!dataInicio && !dataFim && !situacao) {
      cache.set(cacheKey, {
        data: { promocoes: data.promocoes },
        timestamp: Date.now()
      });
    }

    console.log(`Encontradas ${result.metadata.total} promoções`);
    res.json(result);

  } catch (error) {
    console.error('Erro ao buscar promoções:', error.message);
    
    // Retornar dados de exemplo em caso de erro
    const sampleData = {
      promocoes: [
        {
          numeroPromocao: "2025/00001",
          nome: "Promoção de Exemplo - Smartphone 2025",
          modalidade: "Sorteio",
          numeroCA: "CA202500001",
          codigoAutenticidade: "ABC123",
          situacao: "AUTORIZADA",
          dataInicio: "2025-01-01",
          dataFim: "2025-12-31",
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
              inicioApuracao: "2025-12-31T14:00:00",
              fimApuracao: "2025-12-31T16:00:00",
              inicioParticipacao: "2025-01-01",
              fimParticipacao: "2025-12-30",
              premios: [
                {
                  descricao: "Smartphone Galaxy S25",
                  quantidade: 10,
                  valor_unitario: 5000.00,
                  valor_total: 50000.00,
                  ordem: "1",
                  data_entrega: "2026-01-15"
                }
              ]
            }
          ]
        }
      ],
      metadata: {
        total: 1,
        timestamp: new Date().toISOString(),
        query: req.query,
        isSampleData: true,
        error: error.message
      }
    };

    res.json(sampleData);
  }
});

// Rota para obter estatísticas do cache
app.get('/api/cache/stats', (req, res) => {
  const stats = {
    cacheSize: cache.size,
    cacheKeys: Array.from(cache.keys()),
    timestamp: new Date().toISOString()
  };
  res.json(stats);
});

// Rota para limpar cache
app.delete('/api/cache', (req, res) => {
  cache.clear();
  res.json({ message: 'Cache limpo com sucesso' });
});

// Rota de health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    cache: {
      size: cache.size
    }
  });
});

// Middleware de tratamento de erros
app.use((err, req, res, next) => {
  console.error('Erro não tratado:', err);
  res.status(500).json({
    error: 'Erro interno do servidor',
    message: process.env.NODE_ENV === 'production' ? 'Algo deu errado' : err.message
  });
});

// Middleware para rotas não encontradas
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Rota não encontrada',
    message: 'A rota solicitada não existe'
  });
});

// Iniciar servidor
if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => {
    console.log(`🚀 Servidor rodando na porta ${PORT}`);
    console.log(`📱 Acesse: http://localhost:${PORT}`);
    console.log(`🔗 API: http://localhost:${PORT}/api/promocoes`);
    console.log(`💊 Health: http://localhost:${PORT}/api/health`);
  });
}

// Exportar para Vercel
module.exports = app;

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM recebido, encerrando servidor...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT recebido, encerrando servidor...');
  process.exit(0);
});
