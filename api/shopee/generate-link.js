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
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  try {
    const { product_id, shop_id } = req.body;
    
    if (!product_id) {
      return res.status(400).json({ 
        success: false,
        error: 'product_id required' 
      });
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
      },
      timeout: 15000
    });
    
    if (response.data && response.data.data) {
      return res.status(200).json({
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
      success: false,
      error: 'Failed to generate affiliate link',
      message: error.message
    });
  }
};
