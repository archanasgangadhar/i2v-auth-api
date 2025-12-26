const { Connection, Request, TYPES } = require('tedious');
const winston = require('winston');
const path = require('path');


const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'db-service' },
  transports: [
    new winston.transports.File({ filename: path.join(__dirname, '../../logs/error.log'), level: 'error' }),
    new winston.transports.File({ filename: path.join(__dirname, '../../logs/combined.log') }),
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    })
  ],
});


let openConnections = [];


const getConfig = () => {
  const requiredEnvVars = ['DB_SERVER', 'DB_USER', 'DB_PASSWORD', 'DB_DATABASE'];
  const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);

  if (missingVars.length > 0) {
    logger.error(`Missing required environment variables: ${missingVars.join(', ')}`);
    throw new Error(`Database configuration incomplete. Missing: ${missingVars.join(', ')}`);
  }

  return {
    server: process.env.DB_SERVER,
    authentication: {
      type: 'default',
      options: {
        userName: process.env.DB_USER,
        password: process.env.DB_PASSWORD
      }
    },
    options: {
      database: process.env.DB_DATABASE,
      encrypt: process.env.DB_ENCRYPT === 'true' || false,
      trustServerCertificate: process.env.DB_TRUST_CERT === 'true' || true,
      connectionTimeout: parseInt(process.env.DB_CONNECTION_TIMEOUT) || 30000,
      requestTimeout: parseInt(process.env.DB_REQUEST_TIMEOUT) || 30000,
      cancelTimeout: parseInt(process.env.DB_CANCEL_TIMEOUT) || 5000,
      enableArithAbort: true,
      enableConcatNullYieldsNull: true,
      enableCursorCloseOnCommit: true,
      enableImplicitTransactions: false,
      enableNumericRoundabort: false,
      enableQuotedIdentifier: true,
      datefirst: 1,
      dateFormat: 'dmy',
      language: 'us_english',
      port: parseInt(process.env.DB_PORT) || 1433,
      instanceName: process.env.DB_INSTANCE || undefined,
      useUTC: process.env.DB_USE_UTC === 'true' || false,
      datefirst: parseInt(process.env.DB_DATEFIRST) || 1,
      dateFormat: process.env.DB_DATE_FORMAT || 'dmy'
    }
  };
};

const config = getConfig();


const retryOperation = async (operation, maxRetries = 3, delay = 1000) => {
  let lastError;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, delay * attempt));
      }
    }
  }
  throw lastError;
};


const createConnection = async () => {
  
  
  return retryOperation(async () => {
    const connection = new Connection(config);
    
    
    openConnections.push(connection);
    
    return new Promise((resolve, reject) => {
      connection.on('connect', (err) => {
        if (err) {
          const index = openConnections.indexOf(connection);
          if (index > -1) openConnections.splice(index, 1);
          reject(err);
        } else {
          resolve(connection);
        }
      });
      
      connection.on('error', (err) => {});
      
      connection.on('end', () => {});
      
      connection.connect();
    });
  });
};


const query = async (connection, sqlQuery, params = {}) => {
  if (!sqlQuery || typeof sqlQuery !== 'string') {
    throw new Error('Invalid SQL query provided');
  }

  if (typeof params !== 'object' || params === null) {
    throw new Error('Parameters must be an object');
  }

  const startTime = Date.now();

  return retryOperation(async () => {
    return new Promise((resolve, reject) => {
      const rows = [];
      const request = new Request(sqlQuery, (err, rowCount) => {
        const duration = Date.now() - startTime;
        if (err) {
          reject(err);
        } else {
          resolve({ rowCount, rows });
        }
      });

      request.on('row', (columns) => {
        rows.push(columns);
      });

      // Add parameters with type checking
      Object.entries(params).forEach(([key, value]) => {
        try {
          if (typeof value === 'string') {
            request.addParameter(key, TYPES.VarChar, value);
          } else if (typeof value === 'number') {
            request.addParameter(key, TYPES.Int, value);
          } else if (typeof value === 'boolean') {
            request.addParameter(key, TYPES.Bit, value);
          } else if (value instanceof Date) {
            request.addParameter(key, TYPES.DateTime, value);
          } else {
            request.addParameter(key, TYPES.VarChar, JSON.stringify(value));
          }
        } catch (paramError) {
          
          reject(paramError);
        }
      });

      connection.execSql(request);
    });
  });
};

const beginTransaction = async (connection) => {
  return new Promise((resolve, reject) => {
    connection.beginTransaction((err) => {
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    });
  });
};

const commitTransaction = async (connection) => {
  return new Promise((resolve, reject) => {
    connection.commitTransaction((err) => {
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    });
  });
};

const rollbackTransaction = async (connection) => {
  return new Promise((resolve, reject) => {
    connection.rollbackTransaction((err) => {
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    });
  });
};

const executeProcedure = async (connection, procedureName, params = {}) => {
  if (!procedureName || typeof procedureName !== 'string') {
    throw new Error('Invalid procedure name provided');
  }

  const startTime = Date.now();

  return retryOperation(async () => {
    return new Promise((resolve, reject) => {
      const rows = [];
      const request = new Request(`EXEC ${procedureName}`, (err, rowCount) => {
        const duration = Date.now() - startTime;
        if (err) {
          reject(err);
        } else {
          resolve({ rowCount, rows });
        }
      });

      request.on('row', (columns) => {
        rows.push(columns);
      });

      Object.entries(params).forEach(([key, value]) => {
        if (typeof value === 'string') {
          request.addParameter(key, TYPES.VarChar, value);
        } else if (typeof value === 'number') {
          request.addParameter(key, TYPES.Int, value);
        } else if (typeof value === 'boolean') {
          request.addParameter(key, TYPES.Bit, value);
        } else if (value instanceof Date) {
          request.addParameter(key, TYPES.DateTime, value);
        } else {
          request.addParameter(key, TYPES.VarChar, JSON.stringify(value));
        }
      });

      connection.callProcedure(request);
    });
  });
};

// Health check function
const healthCheck = async () => {
  try {
    const connection = await createConnection();
    const result = await query(connection, 'SELECT 1 as health_check, GETDATE() as current_time');
    return { status: 'healthy', details: result, totalOpenConnections: openConnections.length };
  } catch (error) {
    return { status: 'unhealthy', error: error.message, totalOpenConnections: openConnections.length };
  }
};


const getConnectionStats = () => {
  return {
    totalOpenConnections: openConnections.length,
    connections: openConnections.map((conn, index) => ({
      id: index,
      connected: conn.connected,
      connecting: conn.connecting
    }))
  };
};

const closeAllConnections = async () => {
  const promises = openConnections.map((connection, index) => {
    return new Promise((resolve) => {
      try {
        connection.close((err) => {
          resolve();
        });
      } catch (error) {
        resolve();
      }
    });
  });
  
  await Promise.all(promises);
  
  
};

process.on('SIGINT', async () => {
  await closeAllConnections();
  setTimeout(() => process.exit(0), 1000);
});

process.on('SIGTERM', async () => {
  await closeAllConnections();
  setTimeout(() => process.exit(0), 1000);
});



module.exports = {
  createConnection,
  query,
  beginTransaction,
  commitTransaction,
  rollbackTransaction,
  executeProcedure,
  healthCheck,
  getConnectionStats,
  closeAllConnections,
  TYPES,
  logger
};
