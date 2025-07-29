const fs = require('fs');
const path = require('path');
const https = require('https');
const logger = require('../utils/logger');

class PricingService {
  constructor() {
    this.dataDir = path.join(process.cwd(), 'data');
    this.pricingFile = path.join(this.dataDir, 'model_pricing.json');
    this.pricingUrl = 'https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json';
    this.fallbackFile = path.join(process.cwd(), 'resources', 'model-pricing', 'model_prices_and_context_window.json');
    this.pricingData = null;
    this.lastUpdated = null;
    this.updateInterval = 24 * 60 * 60 * 1000; // 24小时
  }

  // 初始化价格服务
  async initialize() {
    try {
      // 确保data目录存在
      if (!fs.existsSync(this.dataDir)) {
        fs.mkdirSync(this.dataDir, { recursive: true });
        logger.info('📁 Created data directory');
      }

      // 检查是否需要下载或更新价格数据
      await this.checkAndUpdatePricing();
      
      // 设置定时更新
      setInterval(() => {
        this.checkAndUpdatePricing();
      }, this.updateInterval);

      logger.success('💰 Pricing service initialized successfully');
    } catch (error) {
      logger.error('❌ Failed to initialize pricing service:', error);
    }
  }

  // 检查并更新价格数据
  async checkAndUpdatePricing() {
    try {
      const needsUpdate = this.needsUpdate();
      
      if (needsUpdate) {
        logger.info('🔄 Updating model pricing data...');
        await this.downloadPricingData();
      } else {
        // 如果不需要更新，加载现有数据
        await this.loadPricingData();
      }
    } catch (error) {
      logger.error('❌ Failed to check/update pricing:', error);
      // 如果更新失败，尝试使用fallback
      await this.useFallbackPricing();
    }
  }

  // 检查是否需要更新
  needsUpdate() {
    if (!fs.existsSync(this.pricingFile)) {
      logger.info('📋 Pricing file not found, will download');
      return true;
    }

    const stats = fs.statSync(this.pricingFile);
    const fileAge = Date.now() - stats.mtime.getTime();
    
    if (fileAge > this.updateInterval) {
      logger.info(`📋 Pricing file is ${Math.round(fileAge / (60 * 60 * 1000))} hours old, will update`);
      return true;
    }

    return false;
  }

  // 下载价格数据
  async downloadPricingData() {
    try {
      await this._downloadFromRemote();
    } catch (downloadError) {
      logger.warn(`⚠️  Failed to download pricing data: ${downloadError.message}`);
      logger.info('📋 Using local fallback pricing data...');
      await this.useFallbackPricing();
    }
  }

  // 实际的下载逻辑
  _downloadFromRemote() {
    return new Promise((resolve, reject) => {
      const request = https.get(this.pricingUrl, (response) => {
        if (response.statusCode !== 200) {
          reject(new Error(`HTTP ${response.statusCode}: ${response.statusMessage}`));
          return;
        }

        let data = '';
        response.on('data', (chunk) => {
          data += chunk;
        });

        response.on('end', () => {
          try {
            const jsonData = JSON.parse(data);
            
            // 保存到文件
            fs.writeFileSync(this.pricingFile, JSON.stringify(jsonData, null, 2));
            
            // 更新内存中的数据
            this.pricingData = jsonData;
            this.lastUpdated = new Date();
            
            logger.success(`💰 Downloaded pricing data for ${Object.keys(jsonData).length} models`);
            resolve();
          } catch (error) {
            reject(new Error(`Failed to parse pricing data: ${error.message}`));
          }
        });
      });

      request.on('error', (error) => {
        reject(new Error(`Network error: ${error.message}`));
      });

      request.setTimeout(30000, () => {
        request.destroy();
        reject(new Error('Download timeout after 30 seconds'));
      });
    });
  }

  // 加载本地价格数据
  async loadPricingData() {
    try {
      if (fs.existsSync(this.pricingFile)) {
        const data = fs.readFileSync(this.pricingFile, 'utf8');
        this.pricingData = JSON.parse(data);
        
        const stats = fs.statSync(this.pricingFile);
        this.lastUpdated = stats.mtime;
        
        logger.info(`💰 Loaded pricing data for ${Object.keys(this.pricingData).length} models from cache`);
      } else {
        logger.warn('💰 No pricing data file found, will use fallback');
        await this.useFallbackPricing();
      }
    } catch (error) {
      logger.error('❌ Failed to load pricing data:', error);
      await this.useFallbackPricing();
    }
  }

  // 使用fallback价格数据
  async useFallbackPricing() {
    try {
      if (fs.existsSync(this.fallbackFile)) {
        logger.info('📋 Copying fallback pricing data to data directory...');
        
        // 读取fallback文件
        const fallbackData = fs.readFileSync(this.fallbackFile, 'utf8');
        const jsonData = JSON.parse(fallbackData);
        
        // 保存到data目录
        fs.writeFileSync(this.pricingFile, JSON.stringify(jsonData, null, 2));
        
        // 更新内存中的数据
        this.pricingData = jsonData;
        this.lastUpdated = new Date();
        
        logger.warn(`⚠️  Using fallback pricing data for ${Object.keys(jsonData).length} models`);
        logger.info('💡 Note: This fallback data may be outdated. The system will try to update from the remote source on next check.');
      } else {
        logger.error('❌ Fallback pricing file not found at:', this.fallbackFile);
        logger.error('❌ Please ensure the resources/model-pricing directory exists with the pricing file');
        this.pricingData = {};
      }
    } catch (error) {
      logger.error('❌ Failed to use fallback pricing data:', error);
      this.pricingData = {};
    }
  }

  // 获取模型价格信息
  getModelPricing(modelName) {
    if (!this.pricingData || !modelName) {
      return null;
    }

    // 尝试直接匹配
    if (this.pricingData[modelName]) {
      return this.pricingData[modelName];
    }

    // 尝试模糊匹配（处理版本号等变化）
    const normalizedModel = modelName.toLowerCase().replace(/[_-]/g, '');
    
    for (const [key, value] of Object.entries(this.pricingData)) {
      const normalizedKey = key.toLowerCase().replace(/[_-]/g, '');
      if (normalizedKey.includes(normalizedModel) || normalizedModel.includes(normalizedKey)) {
        logger.debug(`💰 Found pricing for ${modelName} using fuzzy match: ${key}`);
        return value;
      }
    }

    logger.debug(`💰 No pricing found for model: ${modelName}`);
    return null;
  }

  // 计算使用费用
  calculateCost(usage, modelName) {
    const pricing = this.getModelPricing(modelName);
    
    if (!pricing) {
      return {
        inputCost: 0,
        outputCost: 0,
        cacheCreateCost: 0,
        cacheReadCost: 0,
        totalCost: 0,
        hasPricing: false
      };
    }

    const inputCost = (usage.input_tokens || 0) * (pricing.input_cost_per_token || 0);
    const outputCost = (usage.output_tokens || 0) * (pricing.output_cost_per_token || 0);
    const cacheCreateCost = (usage.cache_creation_input_tokens || 0) * (pricing.cache_creation_input_token_cost || 0);
    const cacheReadCost = (usage.cache_read_input_tokens || 0) * (pricing.cache_read_input_token_cost || 0);

    return {
      inputCost,
      outputCost,
      cacheCreateCost,
      cacheReadCost,
      totalCost: inputCost + outputCost + cacheCreateCost + cacheReadCost,
      hasPricing: true,
      pricing: {
        input: pricing.input_cost_per_token || 0,
        output: pricing.output_cost_per_token || 0,
        cacheCreate: pricing.cache_creation_input_token_cost || 0,
        cacheRead: pricing.cache_read_input_token_cost || 0
      }
    };
  }

  // 格式化价格显示
  formatCost(cost) {
    if (cost === 0) return '$0.000000';
    if (cost < 0.000001) return `$${cost.toExponential(2)}`;
    if (cost < 0.01) return `$${cost.toFixed(6)}`;
    if (cost < 1) return `$${cost.toFixed(4)}`;
    return `$${cost.toFixed(2)}`;
  }

  // 获取服务状态
  getStatus() {
    return {
      initialized: this.pricingData !== null,
      lastUpdated: this.lastUpdated,
      modelCount: this.pricingData ? Object.keys(this.pricingData).length : 0,
      nextUpdate: this.lastUpdated ? new Date(this.lastUpdated.getTime() + this.updateInterval) : null
    };
  }

  // 强制更新价格数据
  async forceUpdate() {
    try {
      await this._downloadFromRemote();
      return { success: true, message: 'Pricing data updated successfully' };
    } catch (error) {
      logger.error('❌ Force update failed:', error);
      logger.info('📋 Force update failed, using fallback pricing data...');
      await this.useFallbackPricing();
      return { 
        success: false, 
        message: `Download failed: ${error.message}. Using fallback pricing data instead.` 
      };
    }
  }
}

module.exports = new PricingService();