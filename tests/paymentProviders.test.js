// 渠道验签单测（纯 crypto 往返，不触发外部请求）：验证各渠道 webhook 验签逻辑正确。

const crypto = require('crypto')

const EpayProvider = require('../src/services/payment/providers/epayProvider')
const XunhupayProvider = require('../src/services/payment/providers/xunhupayProvider')
const StripeProvider = require('../src/services/payment/providers/stripeProvider')
const AlipayProvider = require('../src/services/payment/providers/alipayProvider')
const WxpayProvider = require('../src/services/payment/providers/wxpayProvider')

const md5 = (s) => crypto.createHash('md5').update(s, 'utf8').digest('hex')
const sortedStr = (data) =>
  Object.keys(data)
    .sort()
    .map((k) => `${k}=${data[k]}`)
    .join('&')

describe('epay 验签', () => {
  const config = { key: 'secret123' }

  test('正确签名 + TRADE_SUCCESS 通过', async () => {
    const data = {
      pid: '100',
      out_trade_no: 'P1',
      trade_no: 'T1',
      money: '10.00',
      trade_status: 'TRADE_SUCCESS'
    }
    data.sign = md5(sortedStr(data) + config.key)
    const r = await new EpayProvider().verifyWebhook('', {}, config, data)
    expect(r.success).toBe(true)
    expect(r.outTradeNo).toBe('P1')
    expect(r.paidAmount).toBe(10)
  })

  test('错误签名拒绝', async () => {
    const r = await new EpayProvider().verifyWebhook('', {}, config, {
      out_trade_no: 'P1',
      trade_status: 'TRADE_SUCCESS',
      sign: 'bad'
    })
    expect(r.success).toBe(false)
  })
})

describe('xunhupay 验签', () => {
  const config = { appSecret: 'appsec' }

  test('正确 hash + status OD 通过', async () => {
    const data = { trade_order_id: 'P2', transaction_id: 'WX2', total_fee: '20.00', status: 'OD' }
    data.hash = md5(sortedStr(data) + config.appSecret)
    const r = await new XunhupayProvider().verifyWebhook('', {}, config, data)
    expect(r.success).toBe(true)
    expect(r.outTradeNo).toBe('P2')
  })

  test('篡改金额后 hash 不匹配拒绝', async () => {
    const data = { trade_order_id: 'P2', total_fee: '20.00', status: 'OD' }
    data.hash = md5(sortedStr(data) + config.appSecret)
    data.total_fee = '999.00'
    const r = await new XunhupayProvider().verifyWebhook('', {}, config, data)
    expect(r.success).toBe(false)
  })
})

describe('stripe 验签', () => {
  const secret = 'whsec_test'
  const payload = JSON.stringify({
    type: 'checkout.session.completed',
    data: {
      object: {
        payment_status: 'paid',
        metadata: { outTradeNo: 'P3' },
        payment_intent: 'pi_3',
        amount_total: 1500
      }
    }
  })

  test('正确 HMAC 通过', async () => {
    const t = '1700000000'
    const sig = crypto.createHmac('sha256', secret).update(`${t}.${payload}`, 'utf8').digest('hex')
    const r = await new StripeProvider().verifyWebhook(
      payload,
      { 'stripe-signature': `t=${t},v1=${sig}` },
      { webhookSecret: secret }
    )
    expect(r.success).toBe(true)
    expect(r.outTradeNo).toBe('P3')
    expect(r.paidAmount).toBe(15)
  })

  test('错误 HMAC 拒绝', async () => {
    const r = await new StripeProvider().verifyWebhook(
      payload,
      { 'stripe-signature': 't=1700000000,v1=deadbeef' },
      { webhookSecret: secret }
    )
    expect(r.success).toBe(false)
  })
})

describe('alipay RSA2 验签', () => {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
  })

  test('应用私钥签名、支付宝公钥验签通过', async () => {
    const data = {
      out_trade_no: 'P4',
      trade_no: 'AL4',
      total_amount: '30.00',
      trade_status: 'TRADE_SUCCESS'
    }
    data.sign = crypto
      .createSign('RSA-SHA256')
      .update(sortedStr(data), 'utf8')
      .sign(privateKey, 'base64')
    const r = await new AlipayProvider().verifyWebhook('', {}, { alipayPublicKey: publicKey }, data)
    expect(r.success).toBe(true)
    expect(r.outTradeNo).toBe('P4')
    expect(r.paidAmount).toBe(30)
  })

  test('错误公钥验签失败', async () => {
    const other = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
    })
    const data = { out_trade_no: 'P4', total_amount: '30.00', trade_status: 'TRADE_SUCCESS' }
    data.sign = crypto
      .createSign('RSA-SHA256')
      .update(sortedStr(data), 'utf8')
      .sign(privateKey, 'base64')
    const r = await new AlipayProvider().verifyWebhook(
      '',
      {},
      { alipayPublicKey: other.publicKey },
      data
    )
    expect(r.success).toBe(false)
  })
})

describe('wxpay V3 回调 AES-256-GCM 解密', () => {
  const apiV3Key = '12345678901234567890123456789012' // 32 字节

  test('正确密钥解密 + trade_state SUCCESS 通过', async () => {
    const plain = JSON.stringify({
      out_trade_no: 'P5',
      transaction_id: 'wx5',
      trade_state: 'SUCCESS',
      amount: { total: 4000 }
    })
    const nonce = 'abcdefghijkl' // 12 字节
    const aad = 'transaction'
    const cipher = crypto.createCipheriv('aes-256-gcm', Buffer.from(apiV3Key), Buffer.from(nonce))
    cipher.setAAD(Buffer.from(aad))
    const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
    const ciphertext = Buffer.concat([enc, cipher.getAuthTag()]).toString('base64')
    const body = JSON.stringify({
      resource: { algorithm: 'AEAD_AES_256_GCM', ciphertext, nonce, associated_data: aad }
    })
    const r = await new WxpayProvider().verifyWebhook(body, {}, { apiV3Key })
    expect(r.success).toBe(true)
    expect(r.outTradeNo).toBe('P5')
    expect(r.paidAmount).toBe(40)
  })

  test('错误密钥解密失败', async () => {
    const body = JSON.stringify({
      resource: {
        algorithm: 'AEAD_AES_256_GCM',
        ciphertext: Buffer.from('garbage').toString('base64'),
        nonce: 'abcdefghijkl',
        associated_data: 'transaction'
      }
    })
    const r = await new WxpayProvider().verifyWebhook(body, {}, { apiV3Key: 'x'.repeat(32) })
    expect(r.success).toBe(false)
  })
})
