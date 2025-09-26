// Configurações do Banco de Dados MySQL
const dbConfig = {
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT),
  database: process.env.DB_DATABASE,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  connectionLimit: 10,
  charset: 'utf8mb4',
  acquireTimeout: 60000,
  timeout: 60000
};

// Verificar se todas as variáveis de ambiente necessárias estão definidas
const requiredEnvVars = ['DB_HOST', 'DB_PORT', 'DB_DATABASE', 'DB_USER', 'DB_PASSWORD'];
const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingVars.length > 0) {
  console.error('❌ Variáveis de ambiente obrigatórias não encontradas:');
  missingVars.forEach(varName => console.error(`   - ${varName}`));
  console.error('💡 Crie um arquivo .env baseado no .env.example');
  process.exit(1);
}

// Configurações da Aplicação
const appConfig = {
  port: process.env.PORT || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',
  cacheDuration: 5 * 60 * 1000 // 5 minutos
};

module.exports = {
  dbConfig,
  appConfig
};
