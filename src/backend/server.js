// Carregar variáveis de ambiente
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const axios = require('axios');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const path = require('path');
const { buscarPromocoesCompletas, testConnection, closePool } = require('./database');
const { appConfig } = require('./config');

const app = express();
const PORT = appConfig.port;

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
app.use(express.static(path.join(__dirname, '../../public')));

// Cache simples para requisições (5 minutos)
const cache = new Map();
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutos

// Rota principal - servir o site
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Rota para servir CSS
app.get('/styles.css', (req, res) => {
  res.sendFile(path.join(__dirname, 'styles.css'));
});

// Rota para servir JS
app.get('/script.js', (req, res) => {
  res.sendFile(path.join(__dirname, 'script.js'));
});

// Rota para servir favicon
app.get('/favicon.ico', (req, res) => {
  res.status(404).end();
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

        // Buscar dados diretamente do banco (sem cache)
        console.log('Buscando dados no banco de dados');
        const result = await buscarPromocoesCompletas(req.query);

        // Adicionar metadados
        const response = {
            promocoes: result.promocoes,
            pagination: result.pagination,
            metadata: {
                total: result.promocoes.length,
                totalRecords: result.pagination.totalRecords,
                timestamp: new Date().toISOString(),
                query: req.query,
                source: 'database'
            }
        };
        
        console.log('📤 Resposta para o frontend:');
        console.log(`  📊 Promoções na página: ${response.metadata.total}`);
        console.log(`  📄 Página atual: ${result.pagination.currentPage}/${result.pagination.totalPages}`);
        console.log(`  🔍 Query: ${JSON.stringify(req.query)}`);
        console.log(`  📝 Primeira promoção:`, {
            numeroPromocao: result.promocoes[0]?.numeroPromocao,
            nome: result.promocoes[0]?.nome,
            situacao: result.promocoes[0]?.situacao
        });

        // Cache removido para evitar problemas de paginação

        console.log(`Encontradas ${response.metadata.total} promoções na página atual`);
        res.json(response);

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
app.get('/api/health', async (req, res) => {
  const dbConnected = await testConnection();
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    database: {
      connected: dbConnected
    },
    cache: {
      size: cache.size
    }
  });
});

// Rota para testar conexão com banco de dados
app.get('/api/database/test', async (req, res) => {
  try {
    const connected = await testConnection();
    res.json({
      connected,
      message: connected ? 'Conexão com banco de dados OK' : 'Erro na conexão com banco de dados',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      connected: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
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
  app.listen(PORT, async () => {
    console.log(`🚀 Servidor rodando na porta ${PORT}`);
    console.log(`📱 Acesse: http://localhost:${PORT}`);
    console.log(`🔗 API: http://localhost:${PORT}/api/promocoes`);
    console.log(`💊 Health: http://localhost:${PORT}/api/health`);
    console.log(`🗄️  Database Test: http://localhost:${PORT}/api/database/test`);
    
    // Testar conexão com banco de dados
    console.log('🔍 Testando conexão com banco de dados...');
    const dbConnected = await testConnection();
    if (dbConnected) {
      console.log('✅ Banco de dados conectado com sucesso!');
    } else {
      console.log('❌ Erro ao conectar com banco de dados');
    }
  });
}

// Exportar para Vercel
module.exports = app;

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM recebido, encerrando servidor...');
  await closePool();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT recebido, encerrando servidor...');
  await closePool();
  process.exit(0);
});
