/**
 * Claude 代理服务 - Vercel 适配版本
 * 核心代理转发功能
 */

const https = require('https');
const zlib = require('zlib');
const { SocksProxyAgent } = require('socks-proxy-agent');
const { HttpsProxyAgent } = require('https-proxy-agent');
const claudeAccountService = require('./claudeAccountService');
const sessionHelper = require('../utils/sessionHelper');
const logger = require('../utils/logger');
const config = require('../config');

class ClaudeRelayService {
  constructor() {
    this.claudeApiUrl = config.claude.apiUrl;
    this.apiVersion = config.claude.apiVersion;
    this.betaHeader = config.claude.betaHeader;
  }

  // 转发请求到Claude API
  async relayRequest(requestBody, apiKeyData, clientHeaders) {
    try {
      // 生成会话哈希用于sticky会话
      const sessionHash = sessionHelper.generateSessionHash(requestBody);
      
      // 选择可用的Claude账户
      const accountId = await claudeAccountService.selectAccountForApiKey(apiKeyData, sessionHash);
      
      logger.info(`📤 Processing API request for key: ${apiKeyData.name || apiKeyData.id}, account: ${accountId}`);
      
      // 获取有效的访问token
      const accessToken = await claudeAccountService.getValidAccessToken(accountId);
      
      // 处理请求体
      const processedBody = this._processRequestBody(requestBody);
      
      // 获取代理配置
      const proxyAgent = await this._getProxyAgent(accountId);
      
      // 发送请求到Claude API
      const response = await this._makeClaudeRequest(
        processedBody, 
        accessToken, 
        proxyAgent,
        clientHeaders
      );
      
      logger.info(`✅ API request completed - Key: ${apiKeyData.name}, Account: ${accountId}, Model: ${requestBody.model}`);
      
      return response;
    } catch (error) {
      logger.error(`❌ Claude relay request failed for key: ${apiKeyData.name || apiKeyData.id}:`, error.message);
      throw error;
    }
  }

  // 处理流式请求
  async relayStreamRequest(requestBody, apiKeyData, responseStream, clientHeaders, usageCallback) {
    try {
      // 生成会话哈希用于sticky会话
      const sessionHash = sessionHelper.generateSessionHash(requestBody);
      
      // 选择可用的Claude账户
      const accountId = await claudeAccountService.selectAccountForApiKey(apiKeyData, sessionHash);
      
      logger.info(`📡 Processing streaming API request for key: ${apiKeyData.name || apiKeyData.id}, account: ${accountId}`);
      
      // 获取有效的访问token
      const accessToken = await claudeAccountService.getValidAccessToken(accountId);
      
      // 处理请求体
      const processedBody = this._processRequestBody(requestBody);
      
      // 获取代理配置
      const proxyAgent = await this._getProxyAgent(accountId);
      
      // 发送流式请求
      return await this._makeClaudeStreamRequest(
        processedBody, 
        accessToken, 
        proxyAgent, 
        clientHeaders, 
        responseStream,
        usageCallback
      );
    } catch (error) {
      logger.error('❌ Claude stream relay failed:', error);
      throw error;
    }
  }

  // 处理请求体
  _processRequestBody(body) {
    if (!body) return body;

    // 深拷贝请求体
    const processedBody = JSON.parse(JSON.stringify(body));

    // 移除cache_control中的ttl字段
    this._stripTtlFromCacheControl(processedBody);

    return processedBody;
  }

  // 移除TTL字段
  _stripTtlFromCacheControl(body) {
    if (!body || typeof body !== 'object') return;

    const processContentArray = (contentArray) => {
      if (!Array.isArray(contentArray)) return;
      
      contentArray.forEach(item => {
        if (item && typeof item === 'object' && item.cache_control) {
          if (item.cache_control.ttl) {
            delete item.cache_control.ttl;
            logger.debug('🧹 Removed ttl from cache_control');
          }
        }
      });
    };

    if (Array.isArray(body.system)) {
      processContentArray(body.system);
    }

    if (Array.isArray(body.messages)) {
      body.messages.forEach(message => {
        if (message && Array.isArray(message.content)) {
          processContentArray(message.content);
        }
      });
    }
  }

  // 获取代理Agent
  async _getProxyAgent(accountId) {
    try {
      const accountData = await claudeAccountService.getAllAccounts();
      const account = accountData.find(acc => acc.id === accountId);
      
      if (!account || !account.proxy) {
        return null;
      }

      const proxy = account.proxy;
      
      if (proxy.type === 'socks5') {
        const auth = proxy.username && proxy.password ? `${proxy.username}:${proxy.password}@` : '';
        const socksUrl = `socks5://${auth}${proxy.host}:${proxy.port}`;
        return new SocksProxyAgent(socksUrl);
      } else if (proxy.type === 'http' || proxy.type === 'https') {
        const auth = proxy.username && proxy.password ? `${proxy.username}:${proxy.password}@` : '';
        const httpUrl = `${proxy.type}://${auth}${proxy.host}:${proxy.port}`;
        return new HttpsProxyAgent(httpUrl);
      }
    } catch (error) {
      logger.warn('⚠️ Failed to create proxy agent:', error);
    }

    return null;
  }

  // 过滤客户端请求头
  _filterClientHeaders(clientHeaders) {
    const sensitiveHeaders = [
      'x-api-key',
      'authorization',
      'host',
      'content-length',
      'connection',
      'proxy-authorization',
      'content-encoding',
      'transfer-encoding'
    ];
    
    const filteredHeaders = {};
    
    Object.keys(clientHeaders || {}).forEach(key => {
      const lowerKey = key.toLowerCase();
      if (!sensitiveHeaders.includes(lowerKey)) {
        filteredHeaders[key] = clientHeaders[key];
      }
    });
    
    return filteredHeaders;
  }

  // 发送请求到Claude API
  async _makeClaudeRequest(body, accessToken, proxyAgent, clientHeaders) {
    return new Promise((resolve, reject) => {
      const url = new URL(this.claudeApiUrl);
      
      const filteredHeaders = this._filterClientHeaders(clientHeaders);
      
      const options = {
        hostname: url.hostname,
        port: url.port || 443,
        path: url.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
          'anthropic-version': this.apiVersion,
          ...filteredHeaders
        },
        agent: proxyAgent,
        timeout: config.proxy.timeout
      };
      
      if (!filteredHeaders['User-Agent'] && !filteredHeaders['user-agent']) {
        options.headers['User-Agent'] = 'claude-cli/1.0.53 (external, cli)';
      }

      if (this.betaHeader) {
        options.headers['anthropic-beta'] = this.betaHeader;
      }

      const req = https.request(options, (res) => {
        let responseData = Buffer.alloc(0);
        
        res.on('data', (chunk) => {
          responseData = Buffer.concat([responseData, chunk]);
        });
        
        res.on('end', () => {
          try {
            let bodyString = '';
            
            const contentEncoding = res.headers['content-encoding'];
            if (contentEncoding === 'gzip') {
              try {
                bodyString = zlib.gunzipSync(responseData).toString('utf8');
              } catch (unzipError) {
                logger.error('❌ Failed to decompress gzip response:', unzipError);
                bodyString = responseData.toString('utf8');
              }
            } else if (contentEncoding === 'deflate') {
              try {
                bodyString = zlib.inflateSync(responseData).toString('utf8');
              } catch (unzipError) {
                logger.error('❌ Failed to decompress deflate response:', unzipError);
                bodyString = responseData.toString('utf8');
              }
            } else {
              bodyString = responseData.toString('utf8');
            }
            
            const response = {
              statusCode: res.statusCode,
              headers: res.headers,
              body: bodyString
            };
            
            logger.debug(`🔗 Claude API response: ${res.statusCode}`);
            
            resolve(response);
          } catch (error) {
            logger.error('❌ Failed to parse Claude API response:', error);
            reject(error);
          }
        });
      });

      req.on('error', (error) => {
        logger.error('❌ Claude API request error:', error.message);
        
        let errorMessage = 'Upstream request failed';
        if (error.code === 'ECONNRESET') {
          errorMessage = 'Connection reset by Claude API server';
        } else if (error.code === 'ENOTFOUND') {
          errorMessage = 'Unable to resolve Claude API hostname';
        } else if (error.code === 'ECONNREFUSED') {
          errorMessage = 'Connection refused by Claude API server';
        } else if (error.code === 'ETIMEDOUT') {
          errorMessage = 'Connection timed out to Claude API server';
        }
        
        reject(new Error(errorMessage));
      });

      req.on('timeout', () => {
        req.destroy();
        logger.error('❌ Claude API request timeout');
        reject(new Error('Request timeout'));
      });

      req.write(JSON.stringify(body));
      req.end();
    });
  }

  // 发送流式请求到Claude API
  async _makeClaudeStreamRequest(body, accessToken, proxyAgent, clientHeaders, responseStream, usageCallback) {
    return new Promise((resolve, reject) => {
      const url = new URL(this.claudeApiUrl);
      
      const filteredHeaders = this._filterClientHeaders(clientHeaders);
      
      const options = {
        hostname: url.hostname,
        port: url.port || 443,
        path: url.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
          'anthropic-version': this.apiVersion,
          ...filteredHeaders
        },
        agent: proxyAgent,
        timeout: config.proxy.timeout
      };
      
      if (!filteredHeaders['User-Agent'] && !filteredHeaders['user-agent']) {
        options.headers['User-Agent'] = 'claude-cli/1.0.53 (external, cli)';
      }

      if (this.betaHeader) {
        options.headers['anthropic-beta'] = this.betaHeader;
      }

      const req = https.request(options, (res) => {
        // 设置响应头
        responseStream.statusCode = res.statusCode;
        Object.keys(res.headers).forEach(key => {
          responseStream.setHeader(key, res.headers[key]);
        });

        let buffer = '';
        let collectedUsageData = {};
        
        res.on('data', (chunk) => {
          const chunkStr = chunk.toString();
          buffer += chunkStr;
          
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';
          
          if (lines.length > 0) {
            const linesToForward = lines.join('\n') + '\n';
            responseStream.write(linesToForward);
          }
          
          // 解析使用数据
          for (const line of lines) {
            if (line.startsWith('data: ') && line.length > 6) {
              try {
                const jsonStr = line.slice(6);
                const data = JSON.parse(jsonStr);
                
                if (data.type === 'message_start' && data.message && data.message.usage) {
                  collectedUsageData.input_tokens = data.message.usage.input_tokens || 0;
                  collectedUsageData.cache_creation_input_tokens = data.message.usage.cache_creation_input_tokens || 0;
                  collectedUsageData.cache_read_input_tokens = data.message.usage.cache_read_input_tokens || 0;
                  collectedUsageData.model = data.message.model;
                }
                
                if (data.type === 'message_delta' && data.usage && data.usage.output_tokens !== undefined) {
                  collectedUsageData.output_tokens = data.usage.output_tokens || 0;
                  
                  if (collectedUsageData.input_tokens !== undefined && usageCallback) {
                    usageCallback(collectedUsageData);
                  }
                }
              } catch (parseError) {
                // 忽略解析错误
              }
            }
          }
        });
        
        res.on('end', () => {
          if (buffer.trim()) {
            responseStream.write(buffer);
          }
          responseStream.end();
          
          logger.debug('🌊 Claude stream response completed');
          resolve();
        });
      });

      req.on('error', (error) => {
        logger.error('❌ Claude stream request error:', error.message);
        
        let errorMessage = 'Upstream request failed';
        let statusCode = 500;
        
        if (error.code === 'ECONNRESET') {
          errorMessage = 'Connection reset by Claude API server';
          statusCode = 502;
        } else if (error.code === 'ENOTFOUND') {
          errorMessage = 'Unable to resolve Claude API hostname';
          statusCode = 502;
        } else if (error.code === 'ECONNREFUSED') {
          errorMessage = 'Connection refused by Claude API server';
          statusCode = 502;
        } else if (error.code === 'ETIMEDOUT') {
          errorMessage = 'Connection timed out to Claude API server';
          statusCode = 504;
        }
        
        if (!responseStream.headersSent) {
          responseStream.writeHead(statusCode, { 
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive'
          });
        }
        
        if (!responseStream.destroyed) {
          responseStream.write('event: error\n');
          responseStream.write(`data: ${JSON.stringify({ 
            error: errorMessage,
            code: error.code,
            timestamp: new Date().toISOString()
          })}\n\n`);
          responseStream.end();
        }
        
        reject(error);
      });

      req.on('timeout', () => {
        req.destroy();
        logger.error('❌ Claude stream request timeout');
        
        if (!responseStream.headersSent) {
          responseStream.writeHead(504, { 
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive'
          });
        }
        
        if (!responseStream.destroyed) {
          responseStream.write('event: error\n');
          responseStream.write(`data: ${JSON.stringify({ 
            error: 'Request timeout',
            code: 'TIMEOUT',
            timestamp: new Date().toISOString()
          })}\n\n`);
          responseStream.end();
        }
        
        reject(new Error('Request timeout'));
      });

      responseStream.on('close', () => {
        if (!req.destroyed) {
          req.destroy();
        }
      });

      req.write(JSON.stringify(body));
      req.end();
    });
  }
}

module.exports = new ClaudeRelayService();