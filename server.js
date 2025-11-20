// Proxy para Shopee Affiliate API
// Deploy no Railway.app

const express = require('express');
const axios = require('axios');
const crypto = require('crypto');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// Habilitar CORS
app.use(cors());
app.use(express.json());

// CONFIGURAÇÃO DA SHOPEE
const SHOPEE_CONFIG = {
  appId: '18315090255',
  appSecret: '3IDOONLMKJTCHECOFI2R64D6HRAZHRU5',
  baseUrl: 'https://openplatform.shopee.com.br',
  partnerId: process.env.PARTNER_ID || '18315090255'
};

// Função para gerar assinatura HMAC
function generateSign(path, timestamp, params = {}) {
  const sortedParams = Object.keys(params).sort().reduce((acc, key) => {
    acc[key] = params[key];
    return acc;
  }, {});
  
  const paramsStr = Object.entries(sortedParams)
    .map(([key, value]) => `${key}${value}`)
    .join('');
  
  const baseString = `${SHOPEE_CONFIG.partnerId}${path}${timestamp}${paramsStr}`;
  
  const sign = crypto
    .createHmac('sha256', SHOPEE_CONFIG.appSecret)
    .update(baseString)
    .digest('hex')
    .toUpperCase();
  
  return sign;
}

// Endpoint de teste
app.get('/', (req, res) => {
  res.json({
    status: 'online',
    service: 'Shopee Affiliate Proxy',
    version: '1.0.0',
    endpoints: {
      search: '/api/shopee/search',
      products: '/api/shopee/products',
      categories: '/api/shopee/categories',
      recommendations: '/api/shopee/recommendations'
    }
  });
});

// BUSCAR PRODUTOS
app.get('/api/shopee/search', async (req, res) => {
  try {
    const { q, limit = 20, category } = req.query;
    
    if (!q) {
      return res.status(400).json({ error: 'Query parameter required' });
    }

    const timestamp = Math.floor(Date.now() / 1000);
    const path = '/api/v2/affiliate/product_search';
    
    const params = {
      keyword: q,
      limit: parseInt(limit),
      offset: 0,
      sort_type: 'sales', // relevance, sales, price_asc, price_desc
      filter: 'all' // all, free_shipping, mall
    };
    
    if (category) {
      params.category_id = category;
    }
    
    const sign = generateSign(path, timestamp, {
      partner_id: SHOPEE_CONFIG.partnerId,
      timestamp: timestamp,
      ...params
    });
    
    const url = `${SHOPEE_CONFIG.baseUrl}${path}`;
    
    const response = await axios.get(url, {
      params: {
        partner_id: SHOPEE_CONFIG.partnerId,
        timestamp: timestamp,
        sign: sign,
        ...params
      },
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    if (response.data && response.data.data) {
      const products = response.data.data.products || [];
      
      // Formatar produtos
      const formatted = products.map(product => ({
        id: product.item_id || product.product_id,
        shop_id: product.shop_id,
        title: product.name || product.title,
        price: product.price / 100000, // Shopee retorna em centavos x1000
        price_original: product.price_before_discount ? product.price_before_discount / 100000 : null,
        discount: product.discount_percentage || 0,
        image: product.image_url || product.images?.[0],
        sales: product.sold_count || 0,
        stock: product.stock || 0,
        rating: product.rating_star || 0,
        reviews: product.rating_count?.[0] || 0,
        free_shipping: product.free_shipping || false,
        shopee_verified: product.shopee_verified || false,
        affiliate_commission: product.commission_rate ? product.commission_rate / 100 : 0,
        deeplink: product.product_link || null
      }));
      
      return res.json({
        success: true,
        count: formatted.length,
        products: formatted
      });
    }
    
    return res.json({
      success: true,
      count: 0,
      products: []
    });
    
  } catch (error) {
    console.error('Search error:', error.response?.data || error.message);
    return res.status(500).json({
      error: 'Failed to search products',
      message: error.message,
      details: error.response?.data
    });
  }
});

// DETALHES DE PRODUTOS (múltiplos)
app.post('/api/shopee/products', async (req, res) => {
  try {
    const { product_ids } = req.body;
    
    if (!product_ids || !Array.isArray(product_ids)) {
      return res.status(400).json({ error: 'product_ids array required' });
    }
    
    const timestamp = Math.floor(Date.now() / 1000);
    const path = '/api/v2/affiliate/product_info';
    
    const params = {
      product_ids: product_ids.join(','),
      need_images: true,
      need_description: true
    };
    
    const sign = generateSign(path, timestamp, {
      partner_id: SHOPEE_CONFIG.partnerId,
      timestamp: timestamp,
      ...params
    });
    
    const url = `${SHOPEE_CONFIG.baseUrl}${path}`;
    
    const response = await axios.get(url, {
      params: {
        partner_id: SHOPEE_CONFIG.partnerId,
        timestamp: timestamp,
        sign: sign,
        ...params
      }
    });
    
    if (response.data && response.data.data) {
      const products = response.data.data.products || [];
      
      const formatted = products.map(product => ({
        id: product.item_id,
        shop_id: product.shop_id,
        title: product.name,
        description: product.description || '',
        price: product.price / 100000,
        price_original: product.price_before_discount ? product.price_before_discount / 100000 : null,
        discount: product.discount_percentage || 0,
        images: product.images || [],
        sales: product.sold_count || 0,
        stock: product.stock || 0,
        rating: product.rating_star || 0,
        reviews: product.rating_count?.[0] || 0,
        free_shipping: product.free_shipping || false,
        shopee_verified: product.shopee_verified || false,
        affiliate_commission: product.commission_rate ? product.commission_rate / 100 : 0,
        deeplink: product.product_link || null,
        category_id: product.category_id
      }));
      
      return res.json({
        success: true,
        count: formatted.length,
        products: formatted
      });
    }
    
    return res.json({
      success: true,
      count: 0,
      products: []
    });
    
  } catch (error) {
    console.error('Products error:', error.response?.data || error.message);
    return res.status(500).json({
      error: 'Failed to get product details',
      message: error.message
    });
  }
});

// GERAR LINK DE AFILIADO
app.post('/api/shopee/generate-link', async (req, res) => {
  try {
    const { product_id, shop_id } = req.body;
    
    if (!product_id) {
      return res.status(400).json({ error: 'product_id required' });
    }
    
    const timestamp = Math.floor(Date.now() / 1000);
    const path = '/api/v2/affiliate/generate_link';
    
    const params = {
      product_id: product_id,
      shop_id: shop_id || null
    };
    
    const sign = generateSign(path, timestamp, {
      partner_id: SHOPEE_CONFIG.partnerId,
      timestamp: timestamp,
      ...params
    });
    
    const url = `${SHOPEE_CONFIG.baseUrl}${path}`;
    
    const response = await axios.post(url, params, {
      params: {
        partner_id: SHOPEE_CONFIG.partnerId,
        timestamp: timestamp,
        sign: sign
      }
    });
    
    if (response.data && response.data.data) {
      return res.json({
        success: true,
        affiliate_link: response.data.data.short_link || response.data.data.link
      });
    }
    
    return res.status(404).json({
      success: false,
      error: 'Failed to generate link'
    });
    
  } catch (error) {
    console.error('Generate link error:', error.response?.data || error.message);
    return res.status(500).json({
      error: 'Failed to generate affiliate link',
      message: error.message
    });
  }
});

// CATEGORIAS
app.get('/api/shopee/categories', async (req, res) => {
  try {
    const timestamp = Math.floor(Date.now() / 1000);
    const path = '/api/v2/affiliate/category_list';
    
    const sign = generateSign(path, timestamp, {
      partner_id: SHOPEE_CONFIG.partnerId,
      timestamp: timestamp
    });
    
    const url = `${SHOPEE_CONFIG.baseUrl}${path}`;
    
    const response = await axios.get(url, {
      params: {
        partner_id: SHOPEE_CONFIG.partnerId,
        timestamp: timestamp,
        sign: sign
      }
    });
    
    if (response.data && response.data.data) {
      return res.json({
        success: true,
        categories: response.data.data.categories || []
      });
    }
    
    return res.json({
      success: true,
      categories: []
    });
    
  } catch (error) {
    console.error('Categories error:', error.response?.data || error.message);
    return res.status(500).json({
      error: 'Failed to get categories',
      message: error.message
    });
  }
});

// PRODUTOS RECOMENDADOS
app.get('/api/shopee/recommendations', async (req, res) => {
  try {
    const { limit = 20, category } = req.query;
    
    const timestamp = Math.floor(Date.now() / 1000);
    const path = '/api/v2/affiliate/product_recommendation';
    
    const params = {
      limit: parseInt(limit),
      offset: 0
    };
    
    if (category) {
      params.category_id = category;
    }
    
    const sign = generateSign(path, timestamp, {
      partner_id: SHOPEE_CONFIG.partnerId,
      timestamp: timestamp,
      ...params
    });
    
    const url = `${SHOPEE_CONFIG.baseUrl}${path}`;
    
    const response = await axios.get(url, {
      params: {
        partner_id: SHOPEE_CONFIG.partnerId,
        timestamp: timestamp,
        sign: sign,
        ...params
      }
    });
    
    if (response.data && response.data.data) {
      const products = response.data.data.products || [];
      
      const formatted = products.map(product => ({
        id: product.item_id,
        title: product.name,
        price: product.price / 100000,
        image: product.image_url,
        sales: product.sold_count || 0,
        rating: product.rating_star || 0,
        affiliate_commission: product.commission_rate ? product.commission_rate / 100 : 0
      }));
      
      return res.json({
        success: true,
        count: formatted.length,
        products: formatted
      });
    }
    
    return res.json({
      success: true,
      count: 0,
      products: []
    });
    
  } catch (error) {
    console.error('Recommendations error:', error.response?.data || error.message);
    return res.status(500).json({
      error: 'Failed to get recommendations',
      message: error.message
    });
  }
});

// Tratamento de erros
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: err.message
  });
});

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`🚀 Shopee Proxy running on port ${PORT}`);
  console.log(`📝 App ID: ${SHOPEE_CONFIG.appId}`);
  console.log(`🔗 Base URL: ${SHOPEE_CONFIG.baseUrl}`);
});

module.exports = app;
