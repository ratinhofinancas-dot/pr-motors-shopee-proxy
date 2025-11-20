const axios = require('axios');
const crypto = require('crypto');

const SHOPEE_CONFIG = {
  appId: '18315090255',
  appSecret: '3IDOONLMKJTCHECOFI2R64D6HRAZHRU5',
  baseUrl: 'https://openplatform.shopee.com.br',
  partnerId: '18315090255'
};

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

module.exports = async (req, res) => {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  try {
    const { q, limit = 20, category } = req.query;
    
    if (!q) {
      return res.status(400).json({ 
        success: false,
        error: 'Query parameter required' 
      });
    }

    const timestamp = Math.floor(Date.now() / 1000);
    const path = '/api/v2/affiliate/product_search';
    
    const params = {
      keyword: q,
      limit: parseInt(limit),
      offset: 0,
      sort_type: 'sales',
      filter: 'all'
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
      },
      timeout: 30000
    });
    
    if (response.data && response.data.data) {
      const products = response.data.data.products || [];
      
      const formatted = products.map(product => ({
        id: product.item_id || product.product_id,
        shop_id: product.shop_id,
        title: product.name || product.title,
        price: product.price / 100000,
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
      
      return res.status(200).json({
        success: true,
        count: formatted.length,
        products: formatted
      });
    }
    
    return res.status(200).json({
      success: true,
      count: 0,
      products: []
    });
    
  } catch (error) {
    console.error('Search error:', error.response?.data || error.message);
    return res.status(500).json({
      success: false,
      error: 'Failed to search products',
      message: error.message,
      details: error.response?.data
    });
  }
};
